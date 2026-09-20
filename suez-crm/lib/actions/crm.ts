"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { can, canEditOwned, isManager } from "@/lib/permissions";
import { getStages } from "@/lib/crm";
import { zonedToUtc } from "@/lib/format";

const str = (fd: FormData, k: string) => (fd.get(k) ?? "").toString().trim();
const idOf = (fd: FormData, k: string) => (str(fd, k) ? Number(str(fd, k)) : null);

/* ------------------------------------------------------------------ company */
export async function saveCompany(fd: FormData) {
  const me = await requireUser();
  const id = idOf(fd, "id");
  const name = str(fd, "name");
  if (!name) return { error: "A company needs a name." };

  if (id) {
    const [before] = await sql<{ owner_id: number | null }>`select owner_id from crm_companies where id = ${id}`;
    if (!before) return { error: "That account no longer exists." };
    if (!canEditOwned(me, before.owner_id))
      return { error: "This account belongs to another rep. Ask them, or a manager, to change it." };
  }

  const values = {
    name,
    industry: str(fd, "industry") || null,
    website: str(fd, "website") || null,
    email: str(fd, "email") || null,
    phone: str(fd, "phone") || null,
    address: str(fd, "address") || null,
    size: str(fd, "size") || null,
    status: str(fd, "status") || "lead",
    owner: idOf(fd, "owner_id") ?? me.id,
    notes: str(fd, "notes") || null,
  };

  if (id) {
    await sql`
      update crm_companies set name = ${values.name}, industry = ${values.industry}, website = ${values.website},
             email = ${values.email}, phone = ${values.phone}, address = ${values.address}, size = ${values.size},
             status = ${values.status}, owner_id = ${values.owner}, notes = ${values.notes}
       where id = ${id}`;
    await audit(me.id, "crm.company.update", "crm_company", id);
  } else {
    const [row] = await sql<{ id: number }>`
      insert into crm_companies (name, industry, website, email, phone, address, size, status, owner_id, notes)
      values (${values.name}, ${values.industry}, ${values.website}, ${values.email}, ${values.phone},
              ${values.address}, ${values.size}, ${values.status}, ${values.owner}, ${values.notes})
      returning id`;
    await audit(me.id, "crm.company.create", "crm_company", row.id, { name });
  }
  revalidatePath("/companies");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteCompany(fd: FormData) {
  const me = await requireUser();
  if (!isManager(me)) return { error: "Only managers can delete accounts." };
  const id = Number(str(fd, "id"));
  await sql`delete from crm_companies where id = ${id}`;
  await audit(me.id, "crm.company.delete", "crm_company", id);
  revalidatePath("/companies");
  redirect("/companies");
}

/* ------------------------------------------------------------------ contact */
export async function saveContact(fd: FormData) {
  const me = await requireUser();
  const id = idOf(fd, "id");
  const name = str(fd, "full_name");
  if (!name) return { error: "A contact needs a name." };

  if (id) {
    const [before] = await sql<{ owner_id: number | null }>`select owner_id from crm_contacts where id = ${id}`;
    if (!before) return { error: "That contact no longer exists." };
    if (!canEditOwned(me, before.owner_id))
      return { error: "This contact belongs to another rep. Ask them, or a manager, to change it." };
  }

  const company = idOf(fd, "company_id");
  const primary = fd.get("is_primary") === "on";

  let contactId = id;
  if (id) {
    await sql`
      update crm_contacts set full_name = ${name}, company_id = ${company}, job_title = ${str(fd, "job_title") || null},
             email = ${str(fd, "email") || null}, phone = ${str(fd, "phone") || null}, is_primary = ${primary},
             owner_id = ${idOf(fd, "owner_id") ?? me.id}, notes = ${str(fd, "notes") || null}
       where id = ${id}`;
    await audit(me.id, "crm.contact.update", "crm_contact", id);
  } else {
    const [row] = await sql<{ id: number }>`
      insert into crm_contacts (full_name, company_id, job_title, email, phone, is_primary, owner_id, notes)
      values (${name}, ${company}, ${str(fd, "job_title") || null}, ${str(fd, "email") || null},
              ${str(fd, "phone") || null}, ${primary}, ${idOf(fd, "owner_id") ?? me.id}, ${str(fd, "notes") || null})
      returning id`;
    contactId = row.id;
    await audit(me.id, "crm.contact.create", "crm_contact", row.id, { name });
  }
  // Only one primary contact per company.
  if (primary && company && contactId) {
    await sql`update crm_contacts set is_primary = false where company_id = ${company} and id <> ${contactId}`;
  }
  revalidatePath("/contacts");
  return { ok: true };
}

export async function deleteContact(fd: FormData) {
  const me = await requireUser();
  // A contact carries the history of who we actually talk to at an account;
  // deleting one is a manager's call, like the account itself.
  if (!isManager(me)) return { error: "Only managers can delete contacts." };
  const id = Number(str(fd, "id"));
  await sql`delete from crm_contacts where id = ${id}`;
  await audit(me.id, "crm.contact.delete", "crm_contact", id);
  revalidatePath("/contacts");
  return { ok: true };
}

/* --------------------------------------------------------------------- deal */
export async function saveDeal(fd: FormData) {
  const me = await requireUser();
  const id = idOf(fd, "id");
  const title = str(fd, "title");
  if (!title) return { error: "Give the opportunity a name." };
  const stage = str(fd, "stage") || "qualification";
  const stages = await getStages();
  if (!stages.some((x) => x.key === stage)) return { error: "Unknown stage." };

  const value = Number(str(fd, "value") || 0);
  if (Number.isNaN(value) || value < 0) return { error: "Value must be a positive number." };

  const meta = stages.find((x) => x.key === stage)!;
  const probability = meta.is_won || meta.is_lost
    ? meta.probability
    : Math.max(0, Math.min(100, Number(str(fd, "probability") || meta.probability)));

  if (id) {
    /**
     * An opportunity belongs to the rep who owns it.
     *
     * ponytail: this was requireUser() and nothing else, and the UI offered
     * "Edit" on every record. A staff account executive could — and in testing
     * did — take a colleague's NGN 156,000,000 deal, cut it to NGN 1,000 and
     * reassign it to himself, with no error and no notification. Delete was
     * already manager-only; the edit path, which is the one that moves
     * commission, was wide open.
     */
    const [before] = await sql<{
      owner_id: number | null; title: string; value: string; stage: string; probability: number;
    }>`select owner_id, title, value, stage, probability from crm_deals where id = ${id}`;
    if (!before) return { error: "That opportunity no longer exists." };
    if (!canEditOwned(me, before.owner_id))
      return { error: "This opportunity belongs to another rep. Ask them, or a manager, to change it." };

    const newOwner = idOf(fd, "owner_id") ?? before.owner_id ?? me.id;
    if (newOwner !== before.owner_id && !can(me, "record.reassign"))
      return { error: "Only a manager can reassign an opportunity to someone else." };

    await sql`
      update crm_deals set title = ${title}, company_id = ${idOf(fd, "company_id")}, contact_id = ${idOf(fd, "contact_id")},
             value = ${value}, stage = ${stage}, probability = ${probability},
             owner_id = ${newOwner}, expected_close = ${str(fd, "expected_close") || null},
             notes = ${str(fd, "notes") || null}, updated_at = now()
       where id = ${id}`;
    // Record what actually changed, not merely that something did.
    await audit(me.id, "crm.deal.update", "crm_deal", id, {
      title: before.title === title ? undefined : { from: before.title, to: title },
      value: Number(before.value) === value ? undefined : { from: Number(before.value), to: value },
      stage: before.stage === stage ? undefined : { from: before.stage, to: stage },
      probability: before.probability === probability ? undefined : { from: before.probability, to: probability },
      owner: before.owner_id === newOwner ? undefined : { from: before.owner_id, to: newOwner },
    });
    if (newOwner && newOwner !== before.owner_id && newOwner !== me.id)
      await notify([newOwner], "An opportunity was assigned to you",
        `${me.full_name} moved "${title}" onto your desk.`, `/deals/${id}`,
        { kind: "assignment", entity: "deal", entityId: id, actionLabel: "Open the opportunity" });
    if (newOwner !== before.owner_id && before.owner_id)
      await notify([before.owner_id], "An opportunity was reassigned",
        `${me.full_name} moved "${title}" to another owner.`, `/deals/${id}`,
        { kind: "assignment", entity: "deal", entityId: id, actionLabel: "See the opportunity" });
  } else {
    const [row] = await sql<{ id: number }>`
      insert into crm_deals (title, company_id, contact_id, value, stage, probability, owner_id, expected_close, notes)
      values (${title}, ${idOf(fd, "company_id")}, ${idOf(fd, "contact_id")}, ${value}, ${stage}, ${probability},
              ${idOf(fd, "owner_id") ?? me.id}, ${str(fd, "expected_close") || null}, ${str(fd, "notes") || null})
      returning id`;
    await audit(me.id, "crm.deal.create", "crm_deal", row.id, { title, value });
  }
  revalidatePath("/deals");
  revalidatePath("/");
  return { ok: true };
}

export async function moveDeal(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));
  const stage = str(fd, "stage");
  const stages = await getStages();
  const target = stages.find((x) => x.key === stage);
  if (!target) return { error: "Unknown stage." };

  const [before] = await sql<{ owner_id: number | null; stage: string; probability: number }>`
    select owner_id, stage, probability from crm_deals where id = ${id}`;
  if (!before) return { error: "That opportunity no longer exists." };
  if (!canEditOwned(me, before.owner_id))
    return { error: "This opportunity belongs to another rep. Ask them, or a manager, to move it." };
  if (before.stage === stage) return { ok: true };

  /**
   * The probability comes from the stage.
   *
   * ponytail: this only set 100 for won and 0 for lost and left everything else
   * alone, so a deal dragged from Qualification to Negotiation stayed at 20%
   * and the weighted forecast — the number this board exists to produce — did
   * not move at all. crm_stages has carried the right figure all along.
   */
  await sql`
    update crm_deals
       set stage = ${stage}, probability = ${target.probability}, updated_at = now()
     where id = ${id}`;
  await audit(me.id, "crm.deal.move", "crm_deal", id, {
    stage: { from: before.stage, to: stage },
    probability: { from: before.probability, to: target.probability },
  });
  revalidatePath("/deals");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteDeal(fd: FormData) {
  const me = await requireUser();
  if (!isManager(me)) return { error: "Only managers can delete opportunities." };
  const id = Number(str(fd, "id"));
  await sql`delete from crm_deals where id = ${id}`;
  await audit(me.id, "crm.deal.delete", "crm_deal", id);
  revalidatePath("/deals");
  redirect("/deals");
}

/* ----------------------------------------------------------------- activity */
export async function saveActivity(fd: FormData) {
  const me = await requireUser();
  const subject = str(fd, "subject");
  if (!subject) return { error: "What is the activity?" };

  await sql`
    insert into crm_activities (kind, subject, notes, due_at, company_id, contact_id, deal_id, owner_id)
    values (${str(fd, "kind") || "task"}, ${subject}, ${str(fd, "notes") || null},
            ${zonedToUtc(str(fd, "due_at"))}, ${idOf(fd, "company_id")}, ${idOf(fd, "contact_id")},
            ${idOf(fd, "deal_id")}, ${idOf(fd, "owner_id") ?? me.id})`;
  await audit(me.id, "crm.activity.create");
  revalidatePath("/activities");
  revalidatePath("/");
  return { ok: true };
}

export async function toggleActivity(fd: FormData) {
  await requireUser();
  const id = Number(str(fd, "id"));
  await sql`
    update crm_activities
       set completed_at = case when completed_at is null then now() else null end
     where id = ${id}`;
  revalidatePath("/activities");
  revalidatePath("/");
  return { ok: true };
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { stageProbability } from "@/lib/crm";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { nextRef } from "@/lib/refs";
import { scoreLead } from "@/lib/scoring";
import { canDeleteOwned, canEditOwned } from "@/lib/permissions";
import { documentTotals, ticketDueHours } from "@/lib/money";
import { htmlToText, isBlankHtml, sanitizeHtml } from "@/lib/sanitize-html";
import { sendCrmEmail } from "@/lib/mail";

const str = (fd: FormData, k: string) => (fd.get(k) ?? "").toString().trim();
const num = (fd: FormData, k: string) => Number(str(fd, k) || 0);

/* ------------------------------------------------------------------ leads */

export async function saveLead(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id")) || null;
  const fullName = str(fd, "full_name");
  if (!fullName) return { error: "The lead needs a name." };

  const lead = {
    full_name: fullName,
    company_name: str(fd, "company_name") || null,
    job_title: str(fd, "job_title") || null,
    email: str(fd, "email") || null,
    phone: str(fd, "phone") || null,
    source: str(fd, "source") || "other",
    industry: str(fd, "industry") || null,
    estimated_value: num(fd, "estimated_value"),
  };
  const score = scoreLead(lead);

  if (id) {
    const [before] = await sql<{ status: string; owner_id: number | null }>`select status, owner_id from crm_leads where id = ${id}`;
    await sql`
      update crm_leads set full_name = ${lead.full_name}, company_name = ${lead.company_name},
                           job_title = ${lead.job_title}, email = ${lead.email}, phone = ${lead.phone},
                           source = ${lead.source}, industry = ${lead.industry},
                           estimated_value = ${lead.estimated_value}, score = ${score},
                           status = ${str(fd, "status") || "new"}, notes = ${str(fd, "notes") || null},
                           owner_id = ${Number(str(fd, "owner_id")) || me.id}
       where id = ${id}`;
    await audit(me.id, "lead.update", "lead", id);
    const status = str(fd, "status") || "new";
  } else {
    const [created] = await sql<{ id: number }>`
      insert into crm_leads (full_name, company_name, job_title, email, phone, source, industry,
                             estimated_value, score, status, notes, owner_id)
      values (${lead.full_name}, ${lead.company_name}, ${lead.job_title}, ${lead.email}, ${lead.phone},
              ${lead.source}, ${lead.industry}, ${lead.estimated_value}, ${score},
              ${str(fd, "status") || "new"}, ${str(fd, "notes") || null}, ${Number(str(fd, "owner_id")) || me.id}) returning id`;
    await audit(me.id, "lead.create", "lead", created.id, { fullName, score });
  }
  revalidatePath("/leads");
  return { ok: true };
}

/**
 * Turns a lead into a company + contact + opportunity in one step, and keeps
 * the links so the lead row stays as the record of where the account came from.
 */
export async function convertLead(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));
  const [lead] = await sql<{
    id: number; full_name: string; company_name: string | null; job_title: string | null;
    email: string | null; phone: string | null; industry: string | null;
    estimated_value: string; owner_id: number | null; status: string; source: string;
  }>`select * from crm_leads where id = ${id}`;
  if (!lead) return { error: "That lead no longer exists." };
  if (lead.status === "converted") return { error: "That lead has already been converted." };

  const owner = lead.owner_id ?? me.id;
  const companyName = lead.company_name || `${lead.full_name} (individual)`;

  const [existing] = await sql<{ id: number }>`select id from crm_companies where lower(name) = lower(${companyName}) limit 1`;
  const companyId =
    existing?.id ??
    (
      await sql<{ id: number }>`
        insert into crm_companies (name, industry, email, phone, status, owner_id)
        values (${companyName}, ${lead.industry}, ${lead.email}, ${lead.phone}, 'prospect', ${owner})
        returning id`
    )[0].id;

  /**
   * Reuse the person if they are already on file at this account.
   *
   * ponytail: this used to insert unconditionally with is_primary = true, so
   * converting a lead for someone already in the CRM produced a second copy of
   * them at the same company with BOTH records flagged primary. Match on
   * (company, email) first, and only claim primary if the account has none.
   */
  const [already] = lead.email
    ? await sql<{ id: number }>`
        select id from crm_contacts
         where company_id = ${companyId} and lower(email) = lower(${lead.email}) limit 1`
    : [];

  const [{ has_primary }] = await sql<{ has_primary: boolean }>`
    select exists (select 1 from crm_contacts where company_id = ${companyId} and is_primary) as has_primary`;

  const contact = already
    ? (
        await sql<{ id: number }>`
          update crm_contacts
             set job_title = coalesce(job_title, ${lead.job_title}),
                 phone = coalesce(phone, ${lead.phone})
           where id = ${already.id} returning id`
      )[0]
    : (
        await sql<{ id: number }>`
          insert into crm_contacts (company_id, full_name, job_title, email, phone, is_primary, owner_id)
          values (${companyId}, ${lead.full_name}, ${lead.job_title}, ${lead.email}, ${lead.phone},
                  ${!has_primary}, ${owner})
          returning id`
      )[0];

  // A deal with no close date cannot be forecast, so give it one the rep can
  // change rather than leaving the field blank.
  const closeBy = str(fd, "expected_close") || new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);

  const [deal] = await sql<{ id: number }>`
    insert into crm_deals (title, company_id, contact_id, value, stage, probability, owner_id, source, expected_close)
    values (${str(fd, "title") || `${companyName} — initial opportunity`}, ${companyId}, ${contact.id},
            ${Number(lead.estimated_value)}, 'qualification', ${(await stageProbability('qualification')) ?? 20},
            ${owner}, ${lead.source}, ${closeBy})
    returning id`;

  await sql`
    update crm_leads set status = 'converted', converted_company_id = ${companyId},
                         converted_contact_id = ${contact.id}, converted_deal_id = ${deal.id}, converted_at = now()
     where id = ${id}`;

  await audit(me.id, "lead.convert", "lead", id, { companyId, dealId: deal.id });
  revalidatePath("/leads");
  revalidatePath("/deals");
  redirect(`/deals/${deal.id}`);
}

export async function deleteLead(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));
  // The owner may clear their own lead; otherwise a manager decides.
  const [lead] = await sql<{ owner_id: number | null }>`select owner_id from crm_leads where id = ${id}`;
  if (!lead) return { error: "That lead no longer exists." };
  if (!canDeleteOwned(me, lead.owner_id)) return { error: "Only the lead's owner or a manager can delete it." };
  await sql`delete from crm_leads where id = ${id}`;
  await audit(me.id, "lead.delete", "lead", id);
  revalidatePath("/leads");
  return { ok: true };
}

/* ----------------------------------------------------------------- quotes */

/** The line items a quote form submits, ignoring the blank rows it always carries. */
function readLines(fd: FormData) {
  const desc = fd.getAll("line_desc").map((v) => v.toString().trim());
  const qty = fd.getAll("line_qty").map((v) => Number(v.toString() || 0));
  const price = fd.getAll("line_price").map((v) => Number(v.toString() || 0));
  return desc
    .map((d, i) => ({ description: d, quantity: qty[i] || 0, unit_price: price[i] || 0 }))
    .filter((l) => l.description && l.quantity > 0);
}

/**
 * Terms come from the rich editor as HTML, or from an older plain textarea.
 *
 * Both are stored: `terms_html` carries the formatting a customer sees on the
 * printed quote, `terms` the words that search and the export read.
 */
function readTerms(fd: FormData) {
  const html = sanitizeHtml(str(fd, "terms_html") || str(fd, "terms"));
  if (!html || isBlankHtml(html)) return { text: null as string | null, html: null as string | null };
  return { text: htmlToText(html), html };
}

/** Writes the lines of a quote, replacing whatever was there. */
async function writeLines(quoteId: number, lines: { description: string; quantity: number; unit_price: number }[]) {
  await sql`delete from crm_quote_lines where quote_id = ${quoteId}`;
  for (const l of lines) {
    await sql`
      insert into crm_quote_lines (quote_id, description, quantity, unit_price, line_total)
      values (${quoteId}, ${l.description}, ${l.quantity}, ${l.unit_price}, ${l.quantity * l.unit_price})`;
  }
}

/**
 * Freezes a quote exactly as it currently stands.
 *
 * Called before a sent quote is changed, and when one is first sent. Never
 * updates an existing row — a version the customer has seen must not move.
 */
async function freezeQuoteVersion(quoteId: number, note: string | null, byId: number) {
  await sql`
    insert into crm_quote_versions (quote_id, version, title, terms, terms_html, currency, issue_date, valid_until,
                                    subtotal, discount, tax_rate, tax_amount, total, lines, note, created_by)
    select q.id, q.version, q.title, q.terms, q.terms_html, q.currency, q.issue_date, q.valid_until,
           q.subtotal, q.discount, q.tax_rate, q.tax_amount, q.total,
           coalesce((select json_agg(json_build_object(
                              'description', l.description, 'quantity', l.quantity,
                              'unit_price', l.unit_price, 'line_total', l.line_total) order by l.id)
                       from crm_quote_lines l where l.quote_id = q.id), '[]'::json)::jsonb,
           ${note}, ${byId}
      from crm_quotes q
     where q.id = ${quoteId}
    on conflict (quote_id, version) do nothing`;
}

export async function createQuote(fd: FormData) {
  const me = await requireUser();
  const issued = str(fd, "issue_date");
  const validUntil = str(fd, "valid_until");
  if (issued && validUntil && validUntil < issued)
    return { error: "The quote cannot expire before it is issued." };
  const title = str(fd, "title");
  if (!title) return { error: "Give the quote a title." };

  const lines = readLines(fd);
  if (!lines.length) return { error: "Add at least one line." };

  const t = documentTotals(lines, {
    discount: num(fd, "discount"),
    taxRate: str(fd, "tax_rate") === "" ? 7.5 : num(fd, "tax_rate"),
  });
  // The editor submits HTML; `terms` stays the plain-text rendition so search
  // and the CSV export keep working on words rather than markup.
  const { text: terms, html: termsHtml } = readTerms(fd);
  const ref = await nextRef("QTE");

  const [q] = await sql<{ id: number }>`
    insert into crm_quotes (ref, title, company_id, contact_id, deal_id, issue_date, valid_until, currency,
                            subtotal, discount, tax_rate, tax_amount, total, terms, terms_html, owner_id)
    values (${ref}, ${title}, ${Number(str(fd, "company_id")) || null}, ${Number(str(fd, "contact_id")) || null},
            ${Number(str(fd, "deal_id")) || null},
            ${str(fd, "issue_date") || new Date().toISOString().slice(0, 10)}, ${str(fd, "valid_until") || null},
            ${str(fd, "currency") || "NGN"}, ${t.subtotal}, ${t.discount}, ${t.taxRate}, ${t.tax}, ${t.total},
            ${terms}, ${termsHtml}, ${me.id})
    returning id`;

  await writeLines(q.id, lines);
  await audit(me.id, "quote.create", "quote", q.id, { ref, total: t.total });
  revalidatePath("/quotes");
  redirect(`/quotes/${q.id}`);
}

/**
 * Edits a quote, and knows how far it has travelled.
 *
 * ponytail: nothing could change a quote at all. A typo in a draft meant
 * deleting it and re-keying every line, and setQuoteStatus told you to "raise a
 * revised quote instead" — which the system had no way to do.
 *
 * A draft is simply corrected. A sent quote is not: the customer is holding the
 * previous figures, so the version they were sent is frozen first and the
 * change goes out as version 2. A closed quote is not edited here at all —
 * reviseQuote raises a successor with its own reference.
 */
export async function updateQuote(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));

  const [q] = await sql<{ owner_id: number | null; status: string; version: number; ref: string }>`
    select owner_id, status, version, ref from crm_quotes where id = ${id}`;
  if (!q) return { error: "That quote no longer exists." };
  if (!canEditOwned(me, q.owner_id))
    return { error: "This quote belongs to another rep. Ask them, or a manager, to change it." };
  if (q.status !== "draft" && q.status !== "sent")
    return {
      error: `A ${q.status} quote is a closed record and cannot be edited. Raise a revised quote instead — it keeps its own reference and points back at this one.`,
    };

  const title = str(fd, "title");
  if (!title) return { error: "Give the quote a title." };
  const issued = str(fd, "issue_date");
  const validUntil = str(fd, "valid_until");
  if (issued && validUntil && validUntil < issued)
    return { error: "The quote cannot expire before it is issued." };

  const lines = readLines(fd);
  if (!lines.length) return { error: "Add at least one line." };

  const t = documentTotals(lines, {
    discount: num(fd, "discount"),
    taxRate: str(fd, "tax_rate") === "" ? 7.5 : num(fd, "tax_rate"),
  });
  const { text: terms, html: termsHtml } = readTerms(fd);

  // A sent quote is frozen before it moves, so version 2 has something to
  // supersede even if it was sent before versions existed.
  const revising = q.status === "sent";
  const note = str(fd, "note") || null;
  if (revising) {
    await freezeQuoteVersion(id, null, me.id);
    await sql`
      update crm_quote_versions set superseded_at = now()
       where quote_id = ${id} and version = ${q.version} and superseded_at is null`;
  }

  await sql`
    update crm_quotes
       set title = ${title}, issue_date = ${issued || null}, valid_until = ${validUntil || null},
           currency = ${str(fd, "currency") || "NGN"},
           subtotal = ${t.subtotal}, discount = ${t.discount}, tax_rate = ${t.taxRate},
           tax_amount = ${t.tax}, total = ${t.total},
           terms = ${terms}, terms_html = ${termsHtml},
           version = ${revising ? q.version + 1 : q.version},
           updated_at = now(), updated_by = ${me.id}
     where id = ${id}`;
  await writeLines(id, lines);

  if (revising) await freezeQuoteVersion(id, note, me.id);

  await audit(me.id, revising ? "quote.revise" : "quote.update", "quote", id, {
    ref: q.ref,
    total: t.total,
    ...(revising ? { version: q.version + 1, note } : {}),
  });
  revalidatePath("/quotes");
  revalidatePath(`/quotes/${id}`);
  return revising
    ? { ok: true, message: `Issued as version ${q.version + 1}. Send the customer the new figures.` }
    : { ok: true, message: "Quote saved." };
}

/**
 * Raises a new quote to replace a closed one.
 *
 * An accepted quote is the paper behind a commitment and a declined one is a
 * record of what was refused, so neither is renumbered or rewritten. The
 * successor is a fresh draft with its own reference that points back at what it
 * replaces, which is what setQuoteStatus has been telling people to do all
 * along without giving them a way to do it.
 */
export async function reviseQuote(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));

  const [q] = await sql<{ owner_id: number | null; status: string; ref: string; title: string }>`
    select owner_id, status, ref, title from crm_quotes where id = ${id}`;
  if (!q) return { error: "That quote no longer exists." };
  if (!canEditOwned(me, q.owner_id))
    return { error: "This quote belongs to another rep. Ask them, or a manager, to revise it." };

  const [already] = await sql<{ id: number; ref: string }>`
    select id, ref from crm_quotes where supersedes_id = ${id} limit 1`;
  if (already) return { error: `${already.ref} was already raised to replace this quote.` };

  const ref = await nextRef("QTE");
  const [next] = await sql<{ id: number }>`
    insert into crm_quotes (ref, title, company_id, contact_id, deal_id, issue_date, valid_until, currency,
                            subtotal, discount, tax_rate, tax_amount, total, terms, terms_html, status,
                            owner_id, supersedes_id)
    select ${ref}, ${str(fd, "title") || q.title}, company_id, contact_id, deal_id, current_date, valid_until,
           currency, subtotal, discount, tax_rate, tax_amount, total, terms, terms_html, 'draft',
           ${me.id}, ${id}
      from crm_quotes where id = ${id}
    returning id`;

  await sql`
    insert into crm_quote_lines (quote_id, description, quantity, unit_price, line_total)
    select ${next.id}, description, quantity, unit_price, line_total
      from crm_quote_lines where quote_id = ${id} order by id`;

  await sql`update crm_quotes set superseded_at = now() where id = ${id} and superseded_at is null`;

  await audit(me.id, "quote.revise_new", "quote", next.id, { ref, supersedes: q.ref });
  revalidatePath("/quotes");
  revalidatePath(`/quotes/${id}`);
  redirect(`/quotes/${next.id}`);
}

/** Accepting a quote pulls its deal to Negotiation — the two should not drift apart. */
/**
 * Accepting a quote is a commercial commitment, and it pushes the linked
 * opportunity forward.
 *
 * ponytail: this was requireUser() and nothing else, so any signed-in employee
 * could accept or decline anybody's quote — in testing a staff account
 * executive accepted the Managing Director's NGN 62m quote. The delete path
 * immediately below already checked ownership; the status path, which is the
 * one with commercial meaning, did not.
 */
export async function setQuoteStatus(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));
  const status = str(fd, "status");
  if (!["draft", "sent", "accepted", "declined", "expired"].includes(status)) return { error: "Unknown status." };

  const [before] = await sql<{ owner_id: number | null; status: string; deal_id: number | null; ref: string }>`
    select owner_id, status, deal_id, ref from crm_quotes where id = ${id}`;
  if (!before) return { error: "That quote no longer exists." };
  if (!canEditOwned(me, before.owner_id))
    return { error: "This quote belongs to another rep. Ask them, or a manager, to change it." };
  if (before.status === "accepted" && status !== "accepted")
    return { error: "An accepted quote cannot be reopened. Raise a revised quote instead." };

  await sql`update crm_quotes set status = ${status} where id = ${id}`;

  // What the customer receives is frozen at the moment it is sent, so a later
  // revision has a definite thing to supersede.
  if (status === "sent" && before.status === "draft") await freezeQuoteVersion(id, null, me.id);

  if (status === "accepted" && before.deal_id) {
    // Advance the opportunity using the configured stage probability rather
    // than a number hardcoded here.
    const prob = (await stageProbability("negotiation")) ?? 70;
    await sql`
      update crm_deals set stage = 'negotiation', probability = ${prob}, updated_at = now()
       where id = ${before.deal_id} and stage in ('qualification','proposal')`;
  }

  await audit(me.id, "quote.status", "quote", id, { ref: before.ref, from: before.status, to: status });
  revalidatePath(`/quotes/${id}`);
  revalidatePath("/quotes");
  return { ok: true };
}

export async function deleteQuote(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));
  const [q] = await sql<{ owner_id: number | null; status: string }>`select owner_id, status from crm_quotes where id = ${id}`;
  if (!q) return { error: "That quote no longer exists." };
  if (!canDeleteOwned(me, q.owner_id)) return { error: "Only the quote's owner or a manager can delete it." };
  // An accepted quote is the paper behind a commitment; keep it.
  if (q.status === "accepted") return { error: "An accepted quote cannot be deleted. Mark it declined or expired instead." };
  await sql`delete from crm_quotes where id = ${id}`;
  await audit(me.id, "quote.delete", "quote", id);
  revalidatePath("/quotes");
  redirect("/quotes");
}

/* ---------------------------------------------------------------- tickets */

export async function raiseTicket(fd: FormData) {
  const me = await requireUser();
  const subject = str(fd, "subject");
  if (!subject) return { error: "Say what the ticket is about." };

  const ref = await nextRef("TKT");
  const assignee = Number(str(fd, "assignee_id")) || me.id;
  const priority = str(fd, "priority") || "normal";
  const hours = ticketDueHours(priority);

  const [t] = await sql<{ id: number }>`
    insert into crm_tickets (ref, subject, body, company_id, contact_id, priority, channel, assignee_id, due_at, created_by)
    values (${ref}, ${subject}, ${str(fd, "body") || null}, ${Number(str(fd, "company_id")) || null},
            ${Number(str(fd, "contact_id")) || null}, ${priority}, ${str(fd, "channel") || "email"},
            ${assignee}, now() + ${`${hours} hours`}::interval, ${me.id})
    returning id`;

  if (assignee !== me.id)
    await notify([assignee], `Ticket ${ref} assigned to you`, subject, `/tickets/${t.id}`, {
      kind: "ticket",
      entity: "ticket",
      entityId: t.id,
      actionLabel: "Answer it",
      emailBody: str(fd, "body") ? `<p>${str(fd, "body").replace(/</g, "&lt;").slice(0, 600)}</p>` : undefined,
    });
  await audit(me.id, "ticket.raise", "ticket", t.id, { ref, priority });
  revalidatePath("/tickets");
  redirect(`/tickets/${t.id}`);
}

export async function replyToTicket(fd: FormData) {
  const me = await requireUser();
  const ticketId = Number(str(fd, "ticket_id"));
  const body = str(fd, "body");
  if (!body) return { error: "Write a reply first." };

  const internal = fd.get("internal") === "on";
  await sql`
    insert into crm_ticket_replies (ticket_id, author_id, body, internal)
    values (${ticketId}, ${me.id}, ${body}, ${internal})`;

  /**
   * A response target is met by responding.
   *
   * ponytail: nothing recorded the first reply, so the clock kept running and a
   * ticket answered inside the hour still turned red once due_at passed — the
   * "past their response target" figure was really a resolution-overdue count.
   * An internal note is not a response to the client, so it does not stop it.
   */
  if (!internal) {
    await sql`
      update crm_tickets set first_response_at = coalesce(first_response_at, now())
       where id = ${ticketId}`;
  }

  const status = str(fd, "status");
  if (status && ["open", "in_progress", "waiting_customer", "resolved", "closed"].includes(status)) {
    await sql`
      update crm_tickets set status = ${status},
                             resolved_at = case when ${status} in ('resolved','closed') then now() else resolved_at end
       where id = ${ticketId}`;
  }
  await audit(me.id, "ticket.reply", "ticket", ticketId);
  revalidatePath(`/tickets/${ticketId}`);
  return { ok: true };
}

export async function setTicketStatus(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));
  const status = str(fd, "status");
  if (!["open", "in_progress", "waiting_customer", "resolved", "closed"].includes(status)) return { error: "Unknown status." };
  await sql`
    update crm_tickets set status = ${status},
                           resolved_at = case when ${status} in ('resolved','closed') then now() else null end
     where id = ${id}`;
  await audit(me.id, "ticket.status", "ticket", id, { status });
  revalidatePath(`/tickets/${id}`);
  revalidatePath("/tickets");
  return { ok: true };
}

/* -------------------------------------------------------------- campaigns */

export async function saveCampaign(fd: FormData) {
  const me = await requireUser();
  const from = str(fd, "start_date");
  const to = str(fd, "end_date");
  if (from && to && to < from) return { error: "The end date cannot be before the start date." };
  const id = Number(str(fd, "id")) || null;
  const name = str(fd, "name");
  if (!name) return { error: "Name the campaign." };

  if (id) {
    await sql`
      update crm_campaigns set name = ${name}, channel = ${str(fd, "channel") || "email"},
                               status = ${str(fd, "status") || "draft"}, start_date = ${str(fd, "start_date") || null},
                               end_date = ${str(fd, "end_date") || null}, budget = ${num(fd, "budget")},
                               subject = ${str(fd, "subject") || null}, body = ${str(fd, "body") || null}
       where id = ${id}`;
    await audit(me.id, "campaign.update", "campaign", id);
  } else {
    await sql`
      insert into crm_campaigns (name, channel, status, start_date, end_date, budget, subject, body, owner_id)
      values (${name}, ${str(fd, "channel") || "email"}, ${str(fd, "status") || "draft"},
              ${str(fd, "start_date") || null}, ${str(fd, "end_date") || null}, ${num(fd, "budget")},
              ${str(fd, "subject") || null}, ${str(fd, "body") || null}, ${me.id})`;
    await audit(me.id, "campaign.create", "campaign", undefined, { name });
  }
  revalidatePath("/campaigns");
  return { ok: true };
}

/**
 * Builds the recipient list from contacts, skipping anyone who has opted out.
 * Sending itself is left to the campaign's own run — this only fixes the audience.
 */
export async function buildAudience(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));
  const status = str(fd, "company_status");

  const contacts = status
    ? await sql<{ id: number; email: string }>`
        select c.id, c.email from crm_contacts c
          join crm_companies co on co.id = c.company_id
         where c.email is not null and not c.opted_out and co.status = ${status}`
    : await sql<{ id: number; email: string }>`
        select id, email from crm_contacts where email is not null and not opted_out`;

  for (const c of contacts) {
    await sql`
      insert into crm_campaign_recipients (campaign_id, contact_id, email) values (${id}, ${c.id}, ${c.email})
      on conflict (campaign_id, email) do nothing`;
  }
  await audit(me.id, "campaign.audience", "campaign", id, { added: contacts.length });
  revalidatePath(`/campaigns/${id}`);
  return { ok: true, message: `${contacts.length} contact(s) in the audience.` };
}

/** Sends an email campaign once per unsent recipient using the CRM's SMTP account. */
export async function sendCampaign(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));
  const [campaign] = await sql<{ name:string; channel:string; subject:string|null; body:string|null }>`select name,channel,subject,body from crm_campaigns where id=${id}`;
  if (!campaign) return { error: "That campaign no longer exists." };
  if (campaign.channel !== "email") return { error: "Campaign sending supports email only. Record other channels against the campaign by hand." };
  if (!campaign.subject || !campaign.body) return { error: "Add a subject and message before sending." };
  const recipients = await sql<{ id:number; contact_id:number|null; email:string }>`select id,contact_id,email from crm_campaign_recipients where campaign_id=${id} and sent_at is null order by id`;
  if (!recipients.length) return { error: "There are no unsent recipients. Build the audience first." };
  let sent=0; const errors:string[]=[];
  for (const recipient of recipients) {
    try {
      await sendCrmEmail(recipient.email, campaign.subject, campaign.body);
      await sql`update crm_campaign_recipients set sent_at=now() where id=${recipient.id}`;
      sent++;
    } catch(error) { errors.push(`${recipient.email}: ${(error as Error).message}`); }
  }
  await sql`update crm_campaigns set sent_count=(select count(*) from crm_campaign_recipients where campaign_id=${id} and sent_at is not null), status=${errors.length ? "running" : "completed"} where id=${id}`;
  await audit(me.id,"campaign.send","campaign",id,{sent,failed:errors.length});
  revalidatePath(`/campaigns/${id}`); revalidatePath("/campaigns");
  return errors.length ? { error: `${sent} sent; ${errors.length} failed. First error: ${errors[0]}` } : { ok:true, message:`Sent to ${sent} recipient(s).` };
}

export async function deleteCampaign(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));
  const [c] = await sql<{ owner_id: number | null }>`select owner_id from crm_campaigns where id = ${id}`;
  if (!c) return { error: "That campaign no longer exists." };
  if (!canDeleteOwned(me, c.owner_id)) return { error: "Only the campaign's owner or a manager can delete it." };
  await sql`delete from crm_campaigns where id = ${id}`;
  await audit(me.id, "campaign.delete", "campaign", id);
  revalidatePath("/campaigns");
  return { ok: true };
}

/* --------------------------------------------------------------- segments */

export async function saveSegment(fd: FormData) {
  const me = await requireUser();
  const name = str(fd, "name");
  if (!name) return { error: "Name the segment." };
  const rules = [
    { field: "status", op: "eq", value: str(fd, "status") },
    { field: "industry", op: "contains", value: str(fd, "industry") },
    { field: "health", op: "eq", value: str(fd, "health") },
  ].filter((r) => r.value);

  await sql`
    insert into crm_segments (name, entity, rules, owner_id)
    values (${name}, ${str(fd, "entity") || "company"}, ${JSON.stringify(rules)}::jsonb, ${me.id})
    on conflict (name) do update set rules = excluded.rules, entity = excluded.entity`;
  await audit(me.id, "segment.save", "segment", undefined, { name });
  revalidatePath("/segments");
  return { ok: true };
}

export async function deleteSegment(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));
  const [seg] = await sql<{ owner_id: number | null }>`select owner_id from crm_segments where id = ${id}`;
  if (!seg) return { error: "That segment no longer exists." };
  if (!canDeleteOwned(me, seg.owner_id)) return { error: "Only the segment's owner or a manager can delete it." };
  await sql`delete from crm_segments where id = ${id}`;
  await audit(me.id, "segment.delete", "segment", id);
  revalidatePath("/segments");
  return { ok: true };
}

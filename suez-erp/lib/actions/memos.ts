"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { sql } from "@/lib/db";
import { can, requireUser, verifyPassword } from "@/lib/auth";
import { canIssuePolicy, canPublishMemo } from "@/lib/permissions";
import type { SessionUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { saveUpload, snapshotImage } from "@/lib/attachments";
import { bodyHash, canEditMemo } from "@/lib/memos";
import { htmlToText, isBlankHtml, sanitizeHtml } from "@/lib/sanitize-html";
import { getSigningSettings } from "@/lib/settings";

const str = (fd: FormData, k: string) => (fd.get(k) ?? "").toString().trim();
const num = (fd: FormData, k: string) => (str(fd, k) ? Number(str(fd, k)) : null);

/** Everyone the memo is addressed to. */
async function audienceIds(audience: string, departmentId: number | null, selected: number[]) {
  if (audience === "selected") return selected;
  if (audience === "department" && departmentId)
    return (await sql<{ id: number }>`select id from users where department_id = ${departmentId} and status = 'active'`).map((r) => r.id);
  return (await sql<{ id: number }>`select id from users where status = 'active'`).map((r) => r.id);
}

/** Captures the author's signature as it stood at publication. */
async function snapshotAuthorSignature(memoId: number, authorId: number) {
  const [author] = await sql<{ signature: string | null }>`select signature from users where id = ${authorId}`;
  if (!author?.signature) return;
  const snap = await snapshotImage(author.signature, `memo-${memoId}-author`, authorId);
  if (!snap) return;
  await sql`
    update memos set author_signature_ref = ${snap.ref}, author_signature_sha256 = ${snap.sha256}
     where id = ${memoId}`;
}

async function fanOut(memoId: number, recipients: number[], title: string, kind: string, authorName: string) {
  if (!recipients.length) return;
  await sql`
    insert into memo_recipients (memo_id, user_id)
    select ${memoId}, id from users where id = any(${recipients}::int[])
    on conflict do nothing`;
  const [memo] = await sql<{ requires_ack: boolean; attachment_id: number | null }>`
    select requires_ack, attachment_id from memos where id = ${memoId}`;

  // ponytail: the email went out to every recipient in one message, so the
  // whole company was in the To: line of a circular. notify() sends one each.
  await notify(
    recipients,
    `New ${kind}: ${title}`,
    memo?.requires_ack ? `Published by ${authorName} — your signature is required.` : `Published by ${authorName}`,
    `/memos/${memoId}`,
    {
      kind: "memo",
      entity: "memo",
      entityId: memoId,
      attachmentId: memo?.attachment_id ?? null,
      actionLabel: memo?.requires_ack ? "Read and sign" : "Read it",
      emailBody: `<p>A new ${kind} has been published by <strong>${authorName}</strong>.${
        memo?.requires_ack ? " It requires your signature." : ""
      }</p>`,
    },
  );
}

/**
 * Who may issue what.
 *
 * ponytail: this used to be `requireUser()` and nothing else, so an Account
 * Executive could publish an Urgent POLICY to the whole company — the Managing
 * Director included — and oblige all of them to e-sign it. Issuing a formal
 * instrument is an HR/executive act; a line manager may write to their own
 * department; everyone else can still draft, and send it up to be published.
 */
function mayIssue(me: SessionUser, kind: string, audience: string, requiresAck: boolean) {
  if (!canPublishMemo(me))
    return "Only HR, a department head or an administrator can publish a memo. Save it as a draft and ask them to issue it.";
  if (canIssuePolicy(me)) return null;
  if (kind === "policy") return "Policies are issued by HR or an administrator. Save this as a draft for them to publish.";
  if (audience === "all") return "Only HR or an administrator can address a document to the whole company.";
  if (requiresAck) return "Only HR or an administrator can require a signature on a document.";
  return null;
}

/**
 * Writes an immutable copy of a version as it was issued.
 *
 * Called at publication and again on each revision. Never updates an existing
 * row: the point of the table is that what was issued cannot be changed after
 * the fact, which is what makes a signature against it mean anything.
 */
async function freezeVersion(
  memoId: number, version: number, title: string, body: string,
  bodyHtml: string, note: string | null, byId: number,
) {
  await sql`
    insert into memo_versions (memo_id, version, title, body, body_html, body_sha256, note, published_at, created_by)
    values (${memoId}, ${version}, ${title}, ${body}, ${bodyHtml}, ${bodyHash(body)}, ${note}, now(), ${byId})
    on conflict (memo_id, version) do nothing`;
}

export async function saveMemo(fd: FormData) {
  const me = await requireUser();
  const title = str(fd, "title");
  // The editor submits HTML. `body` stays the plain-text rendition so search,
  // the list previews and the CSV export keep working unchanged.
  const bodyHtml = sanitizeHtml(str(fd, "body_html") || str(fd, "body"));
  const body = htmlToText(bodyHtml);
  if (!title) return { error: "Give the memo a title." };
  if (!body || isBlankHtml(bodyHtml)) return { error: "The body cannot be empty." };

  const audience = str(fd, "audience") || "all";
  const departmentId = audience === "department" ? num(fd, "department_id") : null;
  if (audience === "department" && !departmentId) return { error: "Pick a department." };

  const selected = fd.getAll("recipients").map((v) => Number(v)).filter(Boolean);
  if (audience === "selected" && !selected.length) return { error: "Pick at least one recipient." };

  const publish = str(fd, "intent") === "publish";
  const kind = str(fd, "kind") || "memo";
  const requiresAck = fd.get("requires_ack") === "on";
  if (publish) {
    const refusal = mayIssue(me, kind, audience, requiresAck);
    if (refusal) return { error: refusal };
  }

  let attachmentId: number | null = null;
  try {
    attachmentId = await saveUpload(fd.get("attachment"), me.id);
  } catch (e) {
    return { error: (e as Error).message };
  }

  const [memo] = await sql<{ id: number }>`
    insert into memos (kind, title, body, body_html, author_id, priority, audience, department_id, requires_ack, status, attachment_id, published_at)
    values (${kind}, ${title}, ${body}, ${bodyHtml}, ${me.id}, ${str(fd, "priority") || "normal"},
            ${audience}, ${departmentId}, ${requiresAck},
            ${publish ? "published" : "draft"}, ${attachmentId}, ${publish ? new Date() : null})
    returning id`;

  if (publish) {
    await freezeVersion(memo.id, 1, title, body, bodyHtml, null, me.id);
    await snapshotAuthorSignature(memo.id, me.id);
    await fanOut(memo.id, await audienceIds(audience, departmentId, selected), title, kind, me.full_name);
  }
  await audit(me.id, publish ? "memo.publish" : "memo.draft", "memo", memo.id, { title });
  revalidatePath("/memos");
  // Draft authors land on the print-style preview immediately, where they can
  // position their signature before publishing. Published documents go to the
  // normal delivery view.
  redirect(publish ? `/memos/${memo.id}` : `/memos/${memo.id}/document`);
}

export async function publishMemo(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));
  const [memo] = await sql<{ id: number; title: string; kind: string; audience: string; department_id: number | null; author_id: number; status: string }>`
    select id, title, kind, audience, department_id, author_id, status from memos where id = ${id}`;
  if (!memo) return { error: "Memo not found." };
  if (memo.author_id !== me.id && !can(me, "memo.publish.policy")) return { error: "Only the author can publish this." };
  if (memo.status === "published") return { error: "Already published." };
  {
    const [full] = await sql<{ requires_ack: boolean }>`select requires_ack from memos where id = ${id}`;
    const refusal = mayIssue(me, memo.kind, memo.audience, full?.requires_ack ?? false);
    if (refusal) return { error: refusal };
  }

  await sql`update memos set status = 'published', published_at = now() where id = ${id}`;
  {
    const [b] = await sql<{ version: number; title: string; body: string; body_html: string | null }>`
      select version, title, body, body_html from memos where id = ${id}`;
    await freezeVersion(id, b.version, b.title, b.body, b.body_html ?? "", null, me.id);
  }
  await snapshotAuthorSignature(id, memo.author_id);
  await fanOut(id, await audienceIds(memo.audience, memo.department_id, []), memo.title, memo.kind, me.full_name);
  await audit(me.id, "memo.publish", "memo", id);
  revalidatePath("/memos");
  revalidatePath(`/memos/${id}`);
  return { ok: true };
}

/**
 * Stores the author's visual signature position while the document is a draft.
 * Publication locks it with the rest of the issued record; a later change to a
 * live signature must never move an already-issued document.
 */
export async function saveMemoSignaturePlacement(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));
  const x = Number(str(fd, "signature_x"));
  const y = Number(str(fd, "signature_y"));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { error: "Choose a valid signature position." };

  const [memo] = await sql<{ author_id: number; status: string }>`
    select author_id, status from memos where id = ${id}`;
  if (!memo) return { error: "Document not found." };
  if (memo.author_id !== me.id) return { error: "Only the document author can place this signature." };
  if (memo.status !== "draft") return { error: "The signature position is locked once this document is published." };

  // Keep the image within the printable signature panel.  Values are expressed
  // as percentages so the position survives different screen widths and print.
  const placement = { x: Math.max(0, Math.min(64, Math.round(x))), y: Math.max(0, Math.min(55, Math.round(y))) };
  await sql`update memos set author_signature_placement = ${JSON.stringify(placement)}::jsonb where id = ${id}`;
  await audit(me.id, "memo.signature_placement", "memo", id, placement);
  revalidatePath(`/memos/${id}`);
  revalidatePath(`/memos/${id}/document`);
  return { ok: true, message: "Signature position saved." };
}

/**
 * Edits a document, and knows the difference between a draft and an instrument.
 *
 * A draft is simply corrected — nobody has seen it, so there is nothing to
 * preserve. A published document is never rewritten: its issued text is frozen
 * into memo_versions, the version number goes up, and the new text is issued as
 * a revision. Everyone who already signed keeps their signature against the
 * version they actually read, and the register marks it superseded.
 *
 * ponytail: without this there was no way to fix anything after composing it,
 * and the obvious shortcut — an UPDATE on memos.body — would have quietly
 * rewritten documents underneath signatures that claim to attest to them.
 */
export async function updateMemo(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));

  const [memo] = await sql<{
    id: number; author_id: number; status: string; version: number; kind: string;
    audience: string; department_id: number | null; requires_ack: boolean;
    title: string; body: string; body_html: string | null;
  }>`
    select id, author_id, status, version, kind, audience, department_id, requires_ack,
           title, body, body_html
      from memos where id = ${id}`;
  if (!memo) return { error: "Document not found." };
  if (!canEditMemo(memo, me))
    return memo.status === "archived"
      ? { error: "This document is archived. Archived documents are a closed record and cannot be edited." }
      : { error: "Only the author, HR or an administrator can edit this document." };

  const title = str(fd, "title") || memo.title;
  const bodyHtml = sanitizeHtml(str(fd, "body_html"));
  const body = htmlToText(bodyHtml);
  if (!title) return { error: "Give the document a title." };
  if (!body || isBlankHtml(bodyHtml)) return { error: "The body cannot be empty." };

  const unchanged = title === memo.title && body === memo.body && bodyHtml === (memo.body_html ?? "");
  if (unchanged) return { ok: true, message: "No changes to save." };

  /* ---------------------------------------------------------------- draft */
  if (memo.status === "draft") {
    await sql`
      update memos set title = ${title}, body = ${body}, body_html = ${bodyHtml},
             updated_at = now(), updated_by = ${me.id}
       where id = ${id}`;
    await audit(me.id, "memo.edit", "memo", id, { title });
    revalidatePath("/memos");
    revalidatePath(`/memos/${id}`);
    revalidatePath(`/memos/${id}/document`);
    return { ok: true, message: "Draft saved." };
  }

  /* ------------------------------------------------------------ published */
  // Changing an issued document is issuing one, so it takes the same authority.
  const refusal = mayIssue(me, memo.kind, memo.audience, memo.requires_ack);
  if (refusal) return { error: refusal };

  const note = str(fd, "note") || null;
  const reAck = memo.requires_ack && fd.get("re_acknowledge") === "on";
  const next = memo.version + 1;

  // Freeze what is being replaced, in case it was published before versions existed.
  await freezeVersion(id, memo.version, memo.title, memo.body, memo.body_html ?? "", null, memo.author_id);
  await sql`
    update memo_versions set superseded_at = now()
     where memo_id = ${id} and version = ${memo.version} and superseded_at is null`;

  await sql`
    update memos set title = ${title}, body = ${body}, body_html = ${bodyHtml},
           version = ${next}, updated_at = now(), updated_by = ${me.id}
     where id = ${id}`;
  await freezeVersion(id, next, title, body, bodyHtml, note, me.id);

  // Signatures already given stay in memo_signatures whatever happens here;
  // this only decides whether the current register is reset to ask again.
  if (reAck) {
    await sql`
      update memo_recipients
         set acknowledged_at = null, signature_ref = null, signature_sha256 = null,
             signed_ip = null, signed_agent = null, signed_with_password = false,
             acknowledged_version = null, ack_body_sha256 = null, read_at = null
       where memo_id = ${id}`;
  }

  const recipients = (await sql<{ user_id: number }>`
    select user_id from memo_recipients where memo_id = ${id}`).map((r) => r.user_id);
  if (recipients.length) {
    await notify(
      recipients,
      `Revised: ${title}`,
      reAck
        ? `Version ${next} was issued by ${me.full_name}. Please read and sign it again.`
        : `Version ${next} was issued by ${me.full_name}.`,
      `/memos/${id}`,
      {
        kind: "memo",
        entity: "memo",
        entityId: id,
        actionLabel: reAck ? "Read and sign again" : "Read the revision",
        emailBody: note ? `<p>What changed: ${note.replace(/</g, "&lt;")}</p>` : undefined,
      },
    );
  }

  await audit(me.id, "memo.revise", "memo", id, { title, version: next, re_acknowledge: reAck, note });
  revalidatePath("/memos");
  revalidatePath(`/memos/${id}`);
  revalidatePath(`/memos/${id}/document`);
  revalidatePath(`/memos/${id}/register`);
  return { ok: true, message: `Issued as version ${next}.` };
}

export async function archiveMemo(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));
  const [memo] = await sql<{ author_id: number }>`select author_id from memos where id = ${id}`;
  if (!memo) return { error: "Memo not found." };
  if (memo.author_id !== me.id && !can(me, "memo.view_any")) return { error: "You cannot archive this memo." };

  await sql`update memos set status = 'archived' where id = ${id}`;
  await audit(me.id, "memo.archive", "memo", id);
  revalidatePath("/memos");
  redirect("/memos");
}

/** Marks the memo read for the current user. Safe to call on every view. */
/**
 * Records that the signed-in recipient has opened a memo.
 *
 * The reader is taken from the session, never from an argument: this is a
 * "use server" export, so anything it accepts is attacker-controlled, and a
 * caller-supplied user id would let anyone stamp a read receipt against a
 * colleague. Those receipts are the evidence the signature register rests on.
 */
export async function touchMemo(memoId: number) {
  const me = await requireUser();
  await sql`
    update memo_recipients set read_at = now()
     where memo_id = ${memoId} and user_id = ${me.id} and read_at is null`;
}

export async function acknowledgeMemo(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));

  const [memo] = await sql<{ ref: string; requires_ack: boolean; version: number; body: string }>`
    select ref, requires_ack, version, body from memos where id = ${id}`;
  if (!memo) return { error: "Memo not found." };
  if (!memo.requires_ack) return { error: "This document does not require a signature." };
  if (!me.signature) return { error: "Add your signature under Settings → Signature before acknowledging." };

  const [recipient] = await sql<{ acknowledged_at: string | null }>`
    select acknowledged_at from memo_recipients where memo_id = ${id} and user_id = ${me.id}`;
  if (!recipient) return { error: "This document is not addressed to you." };
  if (recipient.acknowledged_at) return { error: "You have already signed this." };

  // A live session is not consent. Whether we insist on re-authentication is policy
  // (Settings → Organisation), but what we insist on is recorded on the row below.
  const { require_password } = await getSigningSettings();
  if (require_password) {
    const password = str(fd, "password");
    const [account] = await sql<{ password_hash: string }>`select password_hash from users where id = ${me.id}`;
    if (!password || !account || !verifyPassword(password, account.password_hash)) {
      return { error: "That password is not correct. Signing was not recorded." };
    }
  }

  // Immutable copy: changing the signature later must not alter this record.
  const snapshot = await snapshotImage(me.signature, `ack-${memo.ref}-${me.id}`, me.id);
  if (!snapshot) return { error: "Your signature could not be read. Re-save it under Settings → Signature." };

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null;

  // What they are signing, fingerprinted. A later revision changes this hash,
  // which is how the register can tell a current signature from a stale one.
  const signedBody = bodyHash(memo.body);
  const agent = h.get("user-agent");

  await sql`
    update memo_recipients
       set acknowledged_at = now(),
           read_at = coalesce(read_at, now()),
           signature_ref = ${snapshot.ref},
           signature_sha256 = ${snapshot.sha256},
           signed_ip = ${ip},
           signed_agent = ${agent},
           signed_with_password = ${require_password},
           acknowledged_version = ${memo.version},
           ack_body_sha256 = ${signedBody}
     where memo_id = ${id} and user_id = ${me.id}`;

  // The append-only record. memo_recipients is reset when a revision asks for
  // fresh signatures; this is never cleared, so who signed what stays provable.
  await sql`
    insert into memo_signatures (memo_id, user_id, version, body_sha256, signature_ref, signature_sha256,
                                 signed_ip, signed_agent, signed_with_password)
    values (${id}, ${me.id}, ${memo.version}, ${signedBody}, ${snapshot.ref}, ${snapshot.sha256},
            ${ip}, ${agent}, ${require_password})`;

  await audit(me.id, "memo.acknowledge", "memo", id, {
    ref: memo.ref,
    version: memo.version,
    sha256: snapshot.sha256,
    body_sha256: signedBody,
    ip,
    password_confirmed: require_password,
  });
  revalidatePath(`/memos/${id}`);
  return { ok: true };
}

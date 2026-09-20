"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { sql } from "@/lib/db";
import { can, requireUser, verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { snapshotImage } from "@/lib/attachments";
import { bodyHash, canViewMemo } from "@/lib/memos";
import { getSigningSettings } from "@/lib/settings";
import { ASK_KEYS, askNeedsSignature, askVerb } from "@/lib/documents";

const str = (fd: FormData, k: string) => (fd.get(k) ?? "").toString().trim();


async function callerContext() {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return {
    ip: (fwd ? fwd.split(",")[0] : h.get("x-real-ip"))?.trim() || null,
    agent: h.get("user-agent"),
  };
}

/**
 * Sends a document to somebody for a decision.
 *
 * ponytail: a document that needed a head of department's approval and
 * signature was printed, walked round, signed in ink and walked back. The
 * portal could publish a document to an audience and collect signatures from
 * everyone in it, which is a different act: this is one person asking one
 * person for a decision, and getting the document back either way.
 */
export async function routeDocument(fd: FormData) {
  const me = await requireUser();
  if (!can(me, "document.route"))
    return { error: "You cannot send documents for approval. Ask HR or your department head to grant it." };

  const memoId = Number(str(fd, "memo_id"));
  const ask = str(fd, "ask") || "approve_sign";
  if (!ASK_KEYS.includes(ask)) return { error: "Choose what the recipient should do." };

  const recipients = fd.getAll("recipient_id").map((v) => Number(v)).filter(Boolean);
  if (!recipients.length) return { error: "Choose who the document goes to." };
  if (recipients.includes(me.id)) return { error: "You cannot send a document to yourself." };

  const [memo] = await sql<{
    id: number; ref: string; title: string; author_id: number; status: string; version: number; body: string;
  }>`select id, ref, title, author_id, status, version, body from memos where id = ${memoId}`;
  if (!memo) return { error: "Document not found." };
  if (memo.author_id !== me.id && !can(me, "memo.view_any"))
    return { error: "Only the author can send this document for approval." };

  const instructions = str(fd, "instructions");
  const due = str(fd, "due_date") || null;

  for (const to of recipients) {
    const [open] = await sql<{ ref: string }>`
      select ref from document_routes
       where memo_id = ${memoId} and recipient_id = ${to} and status = 'pending'`;
    if (open) continue; // already on their desk — do not queue a second copy

    const [route] = await sql<{ id: number; ref: string }>`
      insert into document_routes (memo_id, version, sender_id, recipient_id, ask, instructions, due_date, body_sha256)
      values (${memoId}, ${memo.version}, ${me.id}, ${to}, ${ask}, ${instructions || null}, ${due}, ${bodyHash(memo.body)})
      returning id, ref`;

    await notify(
      [to],
      `Document to ${askVerb(ask)}: ${memo.title}`,
      `${route.ref} · from ${me.full_name}${instructions ? ` — ${instructions}` : ""}`,
      `/memos/${memoId}?route=${route.id}`,
      {
        kind: "document",
        entity: "document_route",
        entityId: route.id,
        actionLabel: "Open the document",
        emailBody: instructions ? `<p><em>${instructions.replace(/</g, "&lt;")}</em></p>` : undefined,
      },
    );
    await audit(me.id, "document.route", "document_route", route.id, { memo: memo.ref, to, ask });
  }

  revalidatePath(`/memos/${memoId}`);
  revalidatePath("/inbox");
  return { ok: true, message: "Sent." };
}

/**
 * The recipient's answer: approve or reject, with a signature where one was asked for.
 */
export async function decideRoute(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));
  const decision = str(fd, "decision");
  if (!["approved", "rejected"].includes(decision)) return { error: "Approve it or reject it." };

  const [route] = await sql<{
    id: number; ref: string; memo_id: number; sender_id: number; recipient_id: number;
    ask: string; status: string; title: string; memo_ref: string; body: string; version: number;
  }>`
    select r.id, r.ref, r.memo_id, r.sender_id, r.recipient_id, r.ask, r.status, r.version,
           m.title, m.ref as memo_ref, m.body
      from document_routes r join memos m on m.id = r.memo_id
     where r.id = ${id}`;
  if (!route) return { error: "That request no longer exists." };
  if (route.recipient_id !== me.id) return { error: "This document is not on your desk." };
  if (route.status !== "pending") return { error: `You have already ${route.status} this.` };

  const note = str(fd, "note");
  if (decision === "rejected" && !note) return { error: "Say why you are rejecting it." };

  let signature: { ref: string; sha256: string } | null = null;
  // A rejection is not signed — there is nothing being assented to.
  if (decision === "approved" && askNeedsSignature(route.ask)) {
    if (!me.signature) return { error: "Add your signature under Settings → Signature before signing a document." };

    const { require_password } = await getSigningSettings();
    if (require_password) {
      const password = str(fd, "password");
      const [account] = await sql<{ password_hash: string }>`select password_hash from users where id = ${me.id}`;
      if (!password || !account || !verifyPassword(password, account.password_hash))
        return { error: "That password is not correct. Nothing was signed." };
    }

    signature = await snapshotImage(me.signature, `route-${route.ref}-${me.id}`, me.id);
    if (!signature) return { error: "Your signature could not be read. Re-save it under Settings → Signature." };
  }

  const { ip, agent } = await callerContext();
  const signedBody = bodyHash(route.body);

  await sql`
    update document_routes
       set status = ${decision}, decision_note = ${note || null}, decided_at = now(),
           signature_ref = ${signature?.ref ?? null}, signature_sha256 = ${signature?.sha256 ?? null},
           body_sha256 = ${signedBody}, signed_ip = ${ip}, signed_agent = ${agent}
     where id = ${id}`;

  await notify(
    [route.sender_id],
    `${decision === "approved" ? "Approved" : "Rejected"}: ${route.title}`,
    `${route.ref} · ${me.full_name}${note ? ` — ${note}` : ""}`,
    `/memos/${route.memo_id}`,
    {
      kind: "document",
      entity: "document_route",
      entityId: route.id,
      actionLabel: "Open the document",
    },
  );

  await audit(me.id, `document.${decision}`, "document_route", id, {
    memo: route.memo_ref,
    signed: !!signature,
    signature_sha256: signature?.sha256 ?? null,
    body_sha256: signedBody,
    ip,
  });

  revalidatePath(`/memos/${route.memo_id}`);
  revalidatePath("/inbox");
  return { ok: true, message: decision === "approved" ? "Approved and returned to the sender." : "Rejected and returned to the sender." };
}

/** Saves the recipient's chosen position before they approve and sign a routed document. */
export async function saveRouteSignaturePlacement(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));
  const x = Number(str(fd, "signature_x"));
  const y = Number(str(fd, "signature_y"));
  if (!me.signature) return { error: "Add your signature under Settings → Signature first." };
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { error: "Choose a valid signature position." };

  const [route] = await sql<{ memo_id: number; recipient_id: number; ask: string; status: string }>`
    select memo_id, recipient_id, ask, status from document_routes where id = ${id}`;
  if (!route) return { error: "That document review no longer exists." };
  if (route.recipient_id !== me.id) return { error: "Only the reviewer can place this signature." };
  if (route.status !== "pending") return { error: "The signature position is locked once a decision is recorded." };
  if (!askNeedsSignature(route.ask)) return { error: "This review does not require a signature." };

  const placement = { x: Math.max(0, Math.min(64, Math.round(x))), y: Math.max(0, Math.min(55, Math.round(y))) };
  await sql`update document_routes set signature_placement = ${JSON.stringify(placement)}::jsonb where id = ${id}`;
  await audit(me.id, "document.signature_placement", "document_route", id, placement);
  revalidatePath(`/memos/${route.memo_id}`);
  revalidatePath(`/memos/${route.memo_id}/review/${id}`);
  return { ok: true, message: "Signature position saved." };
}

/** The sender takes it back before it has been decided. */
export async function cancelRoute(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));
  const [route] = await sql<{ memo_id: number; sender_id: number; recipient_id: number; title: string; ref: string }>`
    select r.memo_id, r.sender_id, r.recipient_id, m.title, r.ref
      from document_routes r join memos m on m.id = r.memo_id
     where r.id = ${id} and r.status = 'pending'`;
  if (!route) return { error: "That request is not open." };
  if (route.sender_id !== me.id) return { error: "Only the sender can withdraw it." };

  await sql`update document_routes set status = 'cancelled', decided_at = now() where id = ${id}`;
  await notify([route.recipient_id], `Withdrawn: ${route.title}`, `${route.ref} · ${me.full_name} took it back.`, `/memos/${route.memo_id}`, {
    kind: "document",
    entity: "document_route",
    entityId: id,
  });
  await audit(me.id, "document.cancel_route", "document_route", id);
  revalidatePath(`/memos/${route.memo_id}`);
  revalidatePath("/inbox");
  return { ok: true };
}

/** The sender has read the outcome, so the inbox can stop flagging it. */
export async function markRouteSeen(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));
  await sql`
    update document_routes set seen_at = now()
     where id = ${id} and sender_id = ${me.id} and status in ('approved','rejected') and seen_at is null`;
  revalidatePath("/inbox");
  return { ok: true };
}

/* ------------------------------------------------------------- annotations */

/**
 * A comment pinned to a passage.
 *
 * The anchor is the quoted text and which occurrence of it was selected. The
 * quote is stored even though it duplicates the document, because that is what
 * lets the reader be shown the comment beside the right words — and told
 * plainly when a revision has removed them, instead of the note silently
 * sliding onto an unrelated clause.
 */
export async function addAnnotation(fd: FormData) {
  const me = await requireUser();
  const memoId = Number(str(fd, "memo_id"));
  const body = str(fd, "body");
  if (!body) return { error: "Write the comment." };

  const [memo] = await sql<{ id: number; author_id: number; version: number; title: string }>`
    select id, author_id, version, title from memos where id = ${memoId}`;
  if (!memo) return { error: "Document not found." };

  const [recipient] = await sql<{ user_id: number }>`
    select user_id from memo_recipients where memo_id = ${memoId} and user_id = ${me.id}`;
  const [routed] = await sql<{ id: number }>`
    select id from document_routes where memo_id = ${memoId} and recipient_id = ${me.id}`;
  if (!canViewMemo(memo, !!recipient || !!routed, me)) return { error: "You cannot comment on this document." };

  const quote = str(fd, "quote").slice(0, 600);
  const occurrence = Math.max(1, Number(str(fd, "occurrence")) || 1);

  const [row] = await sql<{ id: number }>`
    insert into memo_annotations (memo_id, version, user_id, quote, occurrence, body)
    values (${memoId}, ${memo.version}, ${me.id}, ${quote}, ${occurrence}, ${body})
    returning id`;

  // Everyone else already in the conversation about this document.
  const others = await sql<{ id: number }>`
    select distinct u.id
      from users u
     where u.id <> ${me.id}
       and (u.id = ${memo.author_id}
            or u.id in (select user_id from memo_annotations where memo_id = ${memoId})
            or u.id in (select recipient_id from document_routes where memo_id = ${memoId})
            or u.id in (select sender_id from document_routes where memo_id = ${memoId}))`;

  await notify(
    others.map((o) => o.id),
    `Comment on ${memo.title}`,
    `${me.full_name}: ${body.slice(0, 140)}`,
    `/memos/${memoId}#annotation-${row.id}`,
    { kind: "document", entity: "memo", entityId: memoId, actionLabel: "Read the comment" },
  );
  await audit(me.id, "document.annotate", "memo", memoId, { annotation: row.id });
  revalidatePath(`/memos/${memoId}`);
  return { ok: true, message: "Comment added." };
}

export async function resolveAnnotation(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));
  const [note] = await sql<{ memo_id: number; user_id: number; author_id: number; resolved_at: string | null }>`
    select a.memo_id, a.user_id, m.author_id, a.resolved_at
      from memo_annotations a join memos m on m.id = a.memo_id
     where a.id = ${id}`;
  if (!note) return { error: "Comment not found." };
  if (note.user_id !== me.id && note.author_id !== me.id && !can(me, "memo.view_any"))
    return { error: "Only the author of the comment or of the document can resolve it." };

  await sql`
    update memo_annotations
       set resolved_at = ${note.resolved_at ? null : new Date()},
           resolved_by = ${note.resolved_at ? null : me.id}
     where id = ${id}`;
  revalidatePath(`/memos/${note.memo_id}`);
  return { ok: true };
}

export async function deleteAnnotation(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));
  const [note] = await sql<{ memo_id: number; user_id: number }>`
    select memo_id, user_id from memo_annotations where id = ${id}`;
  if (!note) return { error: "Comment not found." };
  if (note.user_id !== me.id) return { error: "Only the person who wrote a comment can delete it." };
  await sql`delete from memo_annotations where id = ${id}`;
  revalidatePath(`/memos/${note.memo_id}`);
  return { ok: true };
}

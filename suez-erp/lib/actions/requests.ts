"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { sql } from "@/lib/db";
import { can, requireUser, verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { saveUpload, snapshotImage } from "@/lib/attachments";
import { titleCase } from "@/lib/format";
import { getSigningSettings } from "@/lib/settings";

const escapeHtml = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const str = (fd: FormData, k: string) => (fd.get(k) ?? "").toString().trim();

const OPEN = ["pending", "in_progress", "awaiting_info"];
const ALL_STATUS = [...OPEN, "completed", "rejected", "cancelled"];

async function signingContext() {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return {
    ip: (forwarded ? forwarded.split(",")[0] : h.get("x-real-ip"))?.trim() || null,
    agent: h.get("user-agent"),
  };
}

export async function createRequest(fd: FormData) {
  const me = await requireUser();
  const title = str(fd, "title");
  const categories = [...new Set(fd.getAll("categories").map(v => v.toString()).filter(Boolean))];
  const chain = [...new Set(fd.getAll("approval_users").map(Number).filter(id => id && id !== me.id))];
  const finalApprover = Number(str(fd, "final_approver_id")) || null;
  if (chain.length && (!finalApprover || !chain.includes(finalApprover))) return { error: "Choose one person in the approval trail as final sign-off." };

  /**
   * A request can be aimed at a person or at a department.
   *
   * ponytail: it could only be aimed at a person, and the person raising it
   * usually does not know which one. So somebody on the support line with a
   * customer waiting walked to the IT desk and asked whoever looked free —
   * which is the behaviour this is here to replace. A departmental request
   * sits in that department's queue until somebody claims it.
   */
  const target = str(fd, "target") || "person";
  const assignee = target === "department" ? null : Number(str(fd, "assignee_id")) || null;
  const departmentId = target === "department" ? Number(str(fd, "department_id")) || null : null;

  if (!title) return { error: "Describe what you need in the title." };
  if (target === "department") {
    if (!departmentId) return { error: "Choose the department this goes to." };
    if (!can(me, "request.route_department"))
      return { error: "You cannot send requests to a department queue. Choose a colleague instead." };
  } else if (!assignee) {
    return { error: "Choose who the request goes to." };
  }
  if (assignee === me.id) return { error: "You cannot raise a request against yourself." };

  let attachmentId: number | null = null;
  try {
    attachmentId = await saveUpload(fd.get("attachment"), me.id);
  } catch (e) {
    return { error: (e as Error).message };
  }

  const [req] = await sql<{ id: number; ref: string }>`
    insert into workflow_requests (title, description, category, requester_id, assignee_id,
                                   department_id, on_behalf_of, priority, due_date)
    values (${title}, ${str(fd, "description") || null}, ${str(fd, "category") || "document"},
            ${me.id}, ${assignee}, ${departmentId}, ${str(fd, "on_behalf_of") || null},
            ${str(fd, "priority") || "normal"}, ${str(fd, "due_date") || null})
    returning id, ref`;

  for (const category of (categories.length ? categories : [str(fd, "category") || "document"]))
    await sql`insert into workflow_request_categories (request_id, category) values (${req.id}, ${category}) on conflict do nothing`;

  if (chain.length) {
    for (const [index, userId] of chain.entries())
      await sql`insert into workflow_request_approval_steps (request_id, step, user_id, is_final) values (${req.id}, ${index + 1}, ${userId}, ${userId === finalApprover})`;
    await notify([chain[0]], `Approval needed: ${title}`, `${req.ref} is waiting for your step in the approval trail.`, `/requests/${req.id}/document`, { kind: "request", entity: "workflow_request", entityId: req.id, actionLabel: "Review & sign document" });
  }

  if (attachmentId) {
    await sql`
      insert into workflow_comments (request_id, user_id, body, attachment_id)
      values (${req.id}, ${me.id}, 'Attached for reference.', ${attachmentId})`;
  }

  // Everyone who could pick it up. For a named assignee that is one person; for
  // a queue it is the department, so nobody has to be walked over to.
  const tell = chain.length ? [] : assignee
    ? [assignee]
    : (await sql<{ id: number }>`
        select id from users where department_id = ${departmentId} and status = 'active' and id <> ${me.id}`)
        .map((u) => u.id);

  await notify(
    tell,
    assignee ? `New request: ${title}` : `New request in your department's queue: ${title}`,
    `${req.ref} · raised by ${me.full_name}${str(fd, "on_behalf_of") ? ` for ${str(fd, "on_behalf_of")}` : ""}`,
    `/requests/${req.id}`,
    {
      kind: "request",
      entity: "workflow_request",
      entityId: req.id,
      attachmentId,
      actionLabel: assignee ? "Open the request" : "Claim it",
      emailBody: str(fd, "description") ? `<p>${escapeHtml(str(fd, "description"))}</p>` : undefined,
    },
  );

  await audit(me.id, "request.create", "workflow_request", req.id, { assignee, department: departmentId, categories, approval_steps: chain.length });
  revalidatePath("/requests");
  redirect(`/requests/${req.id}`);
}

/** Saves a pending approver's visual placement before they sign their step. */
export async function saveRequestApprovalSignaturePlacement(fd: FormData) {
  const me = await requireUser();
  const requestId = Number(str(fd, "id"));
  const x = Number(str(fd, "signature_x"));
  const y = Number(str(fd, "signature_y"));
  if (!me.signature) return { error: "Add your signature under Settings → Signature first." };
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { error: "Choose a valid signature position." };

  const [step] = await sql<{ id: number; step: number; status: string }>`
    select id, step, status from workflow_request_approval_steps where request_id = ${requestId} and user_id = ${me.id}`;
  if (!step || step.status !== "pending") return { error: "There is no pending approval step for you on this request." };
  const [earlier] = await sql<{ count: number }>`
    select count(*)::int as count from workflow_request_approval_steps
     where request_id = ${requestId} and step < ${step.step} and status <> 'approved'`;
  if (earlier.count) return { error: "An earlier approver must decide first." };

  const placement = { x: Math.max(0, Math.min(64, Math.round(x))), y: Math.max(0, Math.min(55, Math.round(y))) };
  await sql`update workflow_request_approval_steps set signature_placement = ${JSON.stringify(placement)}::jsonb where id = ${step.id}`;
  await audit(me.id, "request.signature_placement", "workflow_request", requestId, { step: step.step, ...placement });
  revalidatePath(`/requests/${requestId}`);
  revalidatePath(`/requests/${requestId}/document`);
  return { ok: true, message: "Signature position saved." };
}

/** Approves one ordered step. Only the final selected person can complete/sign off. */
export async function decideRequestApproval(fd: FormData) {
  const me = await requireUser(); const requestId = Number(str(fd, "id")); const decision = str(fd, "decision"); const note = str(fd, "note");
  if (!['approved','rejected'].includes(decision)) return { error: "Choose approve or reject." };
  const [step] = await sql<{id:number;step:number;is_final:boolean;status:string}>`select id,step,is_final,status from workflow_request_approval_steps where request_id=${requestId} and user_id=${me.id}`;
  if (!step || step.status !== 'pending') return { error: "This approval step is not waiting for you." };
  const [previous] = await sql<{n:number}>`select count(*)::int as n from workflow_request_approval_steps where request_id=${requestId} and step < ${step.step} and status <> 'approved'`;
  if (previous.n) return { error: "An earlier approver must decide first." };

  let signature: { ref: string; sha256: string } | null = null;
  if (decision === "approved") {
    if (!me.signature) return { error: "Add your signature under Settings → Signature before approving this document." };
    const { require_password } = await getSigningSettings();
    if (require_password) {
      const password = str(fd, "password");
      const [account] = await sql<{ password_hash: string }>`select password_hash from users where id = ${me.id}`;
      if (!password || !account || !verifyPassword(password, account.password_hash))
        return { error: "That password is not correct. Nothing was signed." };
    }
    signature = await snapshotImage(me.signature, `request-${requestId}-step-${step.step}-${me.id}`, me.id);
    if (!signature) return { error: "Your signature could not be read. Re-save it under Settings → Signature." };
  }

  const { ip, agent } = await signingContext();
  await sql`update workflow_request_approval_steps
               set status=${decision}, note=${note||null}, decided_at=now(),
                   signature_ref=${signature?.ref ?? null}, signature_sha256=${signature?.sha256 ?? null},
                   signed_ip=${signature ? ip : null}, signed_agent=${signature ? agent : null}
             where id=${step.id}`;
  const [request] = await sql<{requester_id:number;title:string;ref:string}>`select requester_id,title,ref from workflow_requests where id=${requestId}`;
  if (!request) return { error: "Request not found." };
  if (decision === 'rejected') {
    await sql`update workflow_requests set status='rejected',resolution=${note||'Rejected in approval trail.'},decided_by=${me.id} where id=${requestId}`;
    await notify([request.requester_id], `Rejected: ${request.title}`, `${request.ref} was rejected by ${me.full_name}${note ? ` — ${note}` : ''}.`, `/requests/${requestId}/document`, { kind:'request', entity:'workflow_request', entityId:requestId });
  } else if (step.is_final) {
    await sql`update workflow_requests set status='completed',completed_at=now(),resolution=${note||'Final approval recorded.'},decided_by=${me.id} where id=${requestId}`;
    await notify([request.requester_id], `Approved: ${request.title}`, `${request.ref} received final sign-off from ${me.full_name}.`, `/requests/${requestId}/document`, { kind:'request', entity:'workflow_request', entityId:requestId, actionLabel: "Download approval document" });
  } else {
    const [next] = await sql<{user_id:number}>`select user_id from workflow_request_approval_steps where request_id=${requestId} and step=${step.step + 1}`;
    if (next) await notify([next.user_id], `Approval needed: ${request.title}`, `${request.ref} is now waiting for your approval step.`, `/requests/${requestId}/document`, { kind:'request', entity:'workflow_request', entityId:requestId, actionLabel:'Review & sign document' });
  }
  await audit(me.id,`request.approval.${decision}`,"workflow_request",requestId,{step:step.step,final:step.is_final,signed:!!signature,signature_sha256:signature?.sha256 ?? null,ip}); revalidatePath('/requests'); revalidatePath(`/requests/${requestId}`); revalidatePath(`/requests/${requestId}/document`); return {ok:true};
}

/**
 * Who may act on a request.
 *
 * With department queues, "the assignee" is no longer always a person: an
 * unclaimed request belongs to a department, and anyone in it may pick it up
 * and work on it. Returned as one predicate so the status change, the claim and
 * the comment cannot drift apart about who is allowed to do what.
 */
type Party = {
  requester_id: number;
  assignee_id: number | null;
  department_id: number | null;
};

function roles(me: { id: number; department_id: number | null; capabilities: string[] }, req: Party) {
  const isAssignee = req.assignee_id === me.id;
  const inQueue = req.assignee_id === null && req.department_id !== null && req.department_id === me.department_id;
  return {
    isRequester: req.requester_id === me.id,
    isAssignee,
    inQueue,
    /** Anyone who can progress the work: the assignee, the queue, or an override. */
    isHandler: isAssignee || inQueue || can(me, "request.override"),
  };
}

/** Everyone to tell about a change, minus whoever made it. */
async function audience(req: Party, actorId: number) {
  const ids = [req.requester_id, req.assignee_id];
  if (!req.assignee_id && req.department_id) {
    const dept = await sql<{ id: number }>`
      select id from users where department_id = ${req.department_id} and status = 'active'`;
    ids.push(...dept.map((d) => d.id));
  }
  return ids.filter((id): id is number => !!id && id !== actorId);
}

export async function setRequestStatus(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));
  const status = str(fd, "status");
  if (!ALL_STATUS.includes(status)) return { error: "Unknown status." };

  const [req] = await sql<Party & { ref: string; title: string; status: string }>`
    select ref, title, requester_id, assignee_id, department_id, status
      from workflow_requests where id = ${id}`;
  if (!req) return { error: "Request not found." };

  // A request with a deliberate approval trail must be progressed through its
  // numbered steps.  Do not let the general work-status control skip the final
  // sign-off (or reject it without recording which approver made the decision).
  if (["completed", "rejected"].includes(status)) {
    const [trail] = await sql<{ count: number }>`
      select count(*)::int as count from workflow_request_approval_steps where request_id = ${id}`;
    if (trail.count) return { error: "This request has an approval trail. Use the approval controls below instead." };
  }

  const who = roles(me, req);
  if (!who.isRequester && !who.isHandler) return { error: "You are not part of this request." };
  if (status === "cancelled" && !who.isRequester && !can(me, "request.override"))
    return { error: "Only the requester can cancel." };
  if (["completed", "rejected", "in_progress", "awaiting_info"].includes(status) && !who.isHandler)
    return { error: "Only the person handling this request can change its work status." };

  // Picking the work up is what claims it: a queued request that somebody has
  // started must stop being offered to the rest of the department. Anyone who
  // is not taking it out of a queue leaves the assignee exactly as it was.
  const claimedBy = who.inQueue && status !== "cancelled" ? me.id : null;

  await sql`
    update workflow_requests
       set status = ${status},
           completed_at = ${status === "completed" ? new Date() : null},
           decided_by = ${["completed", "rejected"].includes(status) ? me.id : null},
           assignee_id = coalesce(assignee_id, ${claimedBy}),
           claimed_at = case when assignee_id is null and ${claimedBy}::int is not null
                             then now() else claimed_at end
     where id = ${id}`;

  await notify(
    await audience(req, me.id),
    `${req.ref} — ${titleCase(status)}`,
    req.title,
    `/requests/${id}`,
    { kind: "request", entity: "workflow_request", entityId: id },
  );
  await audit(me.id, `request.${status}`, "workflow_request", id);
  revalidatePath("/requests");
  revalidatePath(`/requests/${id}`);
  return { ok: true };
}

/**
 * Approve or reject, as one act with a reason.
 *
 * ponytail: a request for a sign-off was progressed through the same
 * "in progress / completed" states as a laptop repair, so "approved" and
 * "we did the thing" were the same status and the reason lived in a comment if
 * it lived anywhere. A decision is recorded as a decision.
 */
export async function decideRequest(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));
  const decision = str(fd, "decision");
  if (!["approved", "rejected"].includes(decision)) return { error: "Approve it or reject it." };

  const note = str(fd, "note");
  if (decision === "rejected" && !note) return { error: "Say why you are rejecting it." };

  const [req] = await sql<Party & { ref: string; title: string; status: string }>`
    select ref, title, requester_id, assignee_id, department_id, status
      from workflow_requests where id = ${id}`;
  if (!req) return { error: "Request not found." };
  if (!OPEN.includes(req.status)) return { error: `This request is already ${req.status.replace("_", " ")}.` };

  const [trail] = await sql<{ count: number }>`
    select count(*)::int as count from workflow_request_approval_steps where request_id = ${id}`;
  if (trail.count) return { error: "This request has an approval trail. Use the approval controls below instead." };

  const who = roles(me, req);
  if (!who.isHandler) return { error: "Only the person handling this request can decide it." };
  if (who.isRequester) return { error: "You cannot decide your own request." };

  await sql`
    update workflow_requests
       set status = ${decision === "approved" ? "completed" : "rejected"},
           completed_at = ${decision === "approved" ? new Date() : null},
           resolution = ${note || null},
           decided_by = ${me.id},
           assignee_id = coalesce(assignee_id, ${me.id}),
           claimed_at = coalesce(claimed_at, now())
     where id = ${id}`;

  await notify(
    [req.requester_id],
    `${decision === "approved" ? "Approved" : "Rejected"}: ${req.title}`,
    `${req.ref} · ${me.full_name}${note ? ` — ${note}` : ""}`,
    `/requests/${id}`,
    { kind: "request", entity: "workflow_request", entityId: id, actionLabel: "Open the request" },
  );
  await audit(me.id, `request.${decision}`, "workflow_request", id, { note });
  revalidatePath("/requests");
  revalidatePath(`/requests/${id}`);
  return { ok: true };
}

/** Takes an unclaimed request out of a department queue. */
export async function claimRequest(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));

  const [req] = await sql<Party & { ref: string; title: string }>`
    select ref, title, requester_id, assignee_id, department_id
      from workflow_requests where id = ${id}`;
  if (!req) return { error: "Request not found." };
  if (req.assignee_id) return { error: "Somebody has already picked this up." };
  if (req.department_id !== me.department_id && !can(me, "request.override"))
    return { error: "That queue belongs to another department." };

  const [claimed] = await sql<{ id: number }>`
    update workflow_requests
       set assignee_id = ${me.id}, claimed_at = now(),
           status = case when status = 'pending' then 'in_progress' else status end
     where id = ${id} and assignee_id is null
    returning id`;
  if (!claimed) return { error: "Somebody claimed it a moment before you did." };

  await sql`insert into workflow_comments (request_id, user_id, body) values (${id}, ${me.id}, 'Picked this up from the queue.')`;
  await notify([req.requester_id], `${req.ref} picked up`, `${me.full_name} is handling it.`, `/requests/${id}`, {
    kind: "request",
    entity: "workflow_request",
    entityId: id,
  });
  await audit(me.id, "request.claim", "workflow_request", id);
  revalidatePath("/requests");
  revalidatePath(`/requests/${id}`);
  return { ok: true };
}

/** Puts it back for a colleague, rather than reassigning it to a named person. */
export async function releaseRequest(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));
  const [req] = await sql<Party & { ref: string; title: string }>`
    select ref, title, requester_id, assignee_id, department_id from workflow_requests where id = ${id}`;
  if (!req) return { error: "Request not found." };
  if (req.assignee_id !== me.id && !can(me, "request.override"))
    return { error: "Only whoever is holding it can put it back." };
  if (!req.department_id) return { error: "This request has no department queue to go back to." };

  await sql`
    update workflow_requests
       set assignee_id = null, claimed_at = null, status = 'pending'
     where id = ${id}`;
  await sql`insert into workflow_comments (request_id, user_id, body) values (${id}, ${me.id}, 'Put this back in the queue.')`;
  await audit(me.id, "request.release", "workflow_request", id);
  revalidatePath("/requests");
  revalidatePath(`/requests/${id}`);
  return { ok: true };
}

export async function reassignRequest(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));
  const to = Number(str(fd, "assignee_id"));
  if (!to) return { error: "Pick a colleague." };

  const [req] = await sql<Party & { ref: string; title: string }>`
    select ref, title, requester_id, assignee_id, department_id from workflow_requests where id = ${id}`;
  if (!req) return { error: "Request not found." };
  const who = roles(me, req);
  if (!who.isHandler && !who.isRequester) return { error: "You cannot reassign this request." };
  if (to === req.requester_id) return { error: "A request cannot be assigned to the person who raised it." };

  await sql`
    update workflow_requests set assignee_id = ${to}, claimed_at = now(), status = 'pending'
     where id = ${id}`;
  await sql`insert into workflow_comments (request_id, user_id, body) values (${id}, ${me.id}, 'Reassigned this request.')`;
  await notify([to], `Request reassigned to you: ${req.title}`, req.ref, `/requests/${id}`, {
    kind: "request",
    entity: "workflow_request",
    entityId: id,
    actionLabel: "Open the request",
  });
  await audit(me.id, "request.reassign", "workflow_request", id, { to });
  revalidatePath(`/requests/${id}`);
  return { ok: true };
}

export async function addRequestComment(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));
  const body = str(fd, "body");

  let attachmentId: number | null = null;
  try {
    attachmentId = await saveUpload(fd.get("attachment"), me.id);
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (!body && !attachmentId) return { error: "Write a message or attach a file." };

  const [req] = await sql<Party & { ref: string; title: string }>`
    select ref, title, requester_id, assignee_id, department_id from workflow_requests where id = ${id}`;
  if (!req) return { error: "Request not found." };
  const party = roles(me, req);
  if (!party.isRequester && !party.isHandler) return { error: "You are not part of this request." };

  await sql`
    insert into workflow_comments (request_id, user_id, body, attachment_id)
    values (${id}, ${me.id}, ${body}, ${attachmentId})`;

  await notify(
    await audience(req, me.id),
    `New reply on ${req.ref}`,
    body.slice(0, 120) || "An attachment was added.",
    `/requests/${id}`,
    { kind: "request", entity: "workflow_request", entityId: id, attachmentId },
  );
  revalidatePath(`/requests/${id}`);
  return { ok: true };
}

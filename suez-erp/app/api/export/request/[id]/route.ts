import { can, getUser } from "@/lib/auth";
import { csvResponse } from "@/lib/csv";
import { sql } from "@/lib/db";

/** A portable audit trail for one workflow document, including each signature hash. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser();
  if (!me) return new Response("Unauthorised", { status: 401 });
  const id = Number((await params).id);
  if (!id) return new Response("Not found", { status: 404 });

  const [request] = await sql<{
    ref: string; title: string; description: string | null; category: string; priority: string; status: string;
    requester_id: number; assignee_id: number | null; department_id: number | null;
  }>`select ref, title, description, category, priority, status, requester_id, assignee_id, department_id from workflow_requests where id = ${id}`;
  if (!request) return new Response("Not found", { status: 404 });

  const isApprover = await sql<{ id: number }>`
    select id from workflow_request_approval_steps where request_id = ${id} and user_id = ${me.id} limit 1`;
  const inQueue = request.assignee_id === null && request.department_id !== null && request.department_id === me.department_id;
  if (request.requester_id !== me.id && request.assignee_id !== me.id && !inQueue && !isApprover.length && !can(me, "request.view_all"))
    return new Response("Not found", { status: 404 });

  const steps = await sql<{
    step: number; name: string; role: string; is_final: boolean; status: string; note: string | null;
    decided_at: string | null; signature_sha256: string | null; signed_ip: string | null;
  }>`
    select s.step, u.full_name as name, u.job_title as role, s.is_final, s.status, s.note,
           s.decided_at, s.signature_sha256, s.signed_ip
      from workflow_request_approval_steps s join users u on u.id = s.user_id
     where s.request_id = ${id} order by s.step`;

  const base = {
    reference: request.ref, request: request.title, description: request.description,
    category: request.category, priority: request.priority, request_status: request.status,
  };
  return csvResponse(`workflow-request-${request.ref}`, [
    { key: "reference", label: "Reference" }, { key: "request", label: "Request" },
    { key: "description", label: "Description" }, { key: "category", label: "Category" },
    { key: "priority", label: "Priority" }, { key: "request_status", label: "Request status" },
    { key: "approval_step", label: "Approval step" }, { key: "approver", label: "Approver" },
    { key: "role", label: "Role" }, { key: "final_signoff", label: "Final sign-off" },
    { key: "approval_status", label: "Approval status" }, { key: "note", label: "Note" },
    { key: "decided_at", label: "Decided at" }, { key: "signature_sha256", label: "Signature SHA-256" },
    { key: "signed_ip", label: "Signing IP" },
  ], (steps.length ? steps : [{ step: null, name: null, role: null, is_final: false, status: null, note: null, decided_at: null, signature_sha256: null, signed_ip: null }]).map((step) => ({
    ...base, approval_step: step.step, approver: step.name, role: step.role, final_signoff: step.is_final ? "yes" : "no",
    approval_status: step.status, note: step.note, decided_at: step.decided_at,
    signature_sha256: step.signature_sha256, signed_ip: step.signed_ip,
  })));
}

import type { SessionUser } from "./auth";

/** Anyone carrying a resolved capability list. Structural, so this module stays pure. */
type Holder = { capabilities: string[] } | null | undefined;

/**
 * Does this person hold the capability?
 *
 * Synchronous on purpose — capabilities come down with the session, so a check
 * in the middle of a page or a server action costs nothing. It lives here, with
 * no runtime imports of its own, so permission logic can be reasoned about and
 * tested without dragging in cookies and redirects.
 */
export const can = (u: Holder, capability: string) => !!u && u.capabilities.includes(capability);

/** Any one of these is enough. */
export const canAny = (u: Holder, ...capabilities: string[]) => capabilities.some((c) => can(u, c));

/**
 * Domain rules that are about a relationship, not a capability.
 *
 * ponytail: this file used to answer everything with the user's role name —
 * `u.role === "admin" || u.role === "hr"` and so on, in about a hundred places.
 * Role-based questions now go through `can(user, "...")` against the roles an
 * administrator can edit under Administration → Roles. What is left here is the
 * part a role cannot express: whether this person owns the record, manages that
 * employee, or is about to approve their own claim.
 */

/** Full reach. Kept for the few places that mean "can configure the system". */
export const isAdmin = (u: SessionUser) => can(u, "roles.manage");

/** Runs a team. A relationship, so it stays a role rather than a capability. */
export const isManager = (u: SessionUser) =>
  u.role === "manager" || canAny(u, "leave.approve_any", "timesheet.approve_any");

export const isFinance = (u: SessionUser) => can(u, "invoice.manage");
export const isProcurement = (u: SessionUser) => can(u, "po.manage");

/** Who may issue a memo, circular or policy to people who did not ask for one. */
export const canPublishMemo = (u: SessionUser) => can(u, "memo.publish");

/**
 * Formal instruments — a policy, anything sent to the whole company, or
 * anything that obliges the reader to sign.
 */
export const canIssuePolicy = (u: SessionUser) => can(u, "memo.publish.policy");

/**
 * Deleting a customer record: the person who owns it, or someone who manages
 * that part of the business. An unowned record falls to managers and above.
 */
export const canDeleteOwned = (u: SessionUser, ownerId: number | null | undefined) =>
  isManager(u) || (ownerId != null && ownerId === u.id);

/**
 * Managing a project: its manager, an administrator, or someone on the team.
 * Members can move and add tasks; only the manager or an admin can delete the
 * project's records outright.
 */
export const canManageProject = (
  u: SessionUser,
  project: { manager_id: number | null },
  isMember = false,
) => isAdmin(u) || project.manager_id === u.id || isMember;

/**
 * Nobody signs off their own money or their own time — not even an administrator.
 *
 * This is a segregation-of-duties control, not a permission check, so no
 * capability grants past it. The person who benefits is never the person who
 * approves, however senior, and however their role is configured.
 */
export const isSelfApproval = (u: SessionUser, subjectId: number) => u.id === subjectId;

export const SELF_APPROVAL_MESSAGE =
  "You cannot approve your own submission. Ask another approver to review it.";

/**
 * Claims above this need a second, independent approver and a receipt — the
 * threshold the company's own expense circular sets.
 */
export const DUAL_APPROVAL_THRESHOLD = 250_000;

/**
 * Who may change a document.
 *
 * ponytail: nobody could. There was no update path at all, so a typo in a draft
 * meant archiving it and composing the whole thing again.
 *
 * Editing a published document is a different act from editing a draft — see
 * updateMemo, which turns it into a numbered revision rather than a rewrite —
 * but the same people are trusted with both: the author, and whoever may issue
 * formal instruments. An archived document is closed and stays closed.
 */
export function canEditMemo(memo: { author_id: number; status: string }, me: SessionUser) {
  if (memo.status === "archived") return false;
  return memo.author_id === me.id || can(me, "memo.publish.policy");
}

/** A signature given against an earlier version than the document now carries. */
export const isStaleSignature = (signedVersion: number | null, current: number) =>
  signedVersion !== null && signedVersion < current;

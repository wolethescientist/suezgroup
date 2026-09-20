import type { SessionUser } from "./auth";

/**
 * Who may do what.
 *
 * ponytail: this file was copied wholesale from the ERP and answered everything
 * with the user's role name. Role-based questions now go through
 * `can(user, "...")` against roles an administrator can edit under
 * Data → Roles & access. What is left here is the part a role cannot express:
 * whether this person owns the record.
 *
 * Most of the CRM is governed by ownership rather than role — a rep works their
 * own accounts, deals and quotes — so these helpers stay small on purpose.
 */

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

/** Configures the system. */
export const isAdmin = (u: SessionUser) => can(u, "roles.manage");

/** Works across the team's records rather than only their own. */
export const isManager = (u: SessionUser) => can(u, "record.delete");

/**
 * Changing a record: the person who owns it, or someone who works across the
 * team. An unowned record (owner_id null) is nobody's in particular, so it
 * falls to anyone — that is how imported data becomes workable before it has
 * been shared out.
 */
export const canEditOwned = (u: SessionUser, ownerId: number | null | undefined) =>
  can(u, "record.edit_any") || ownerId == null || ownerId === u.id;

/**
 * Deleting a record: the person who owns it, or someone who may delete across
 * the team. An unowned record falls to the latter — deleting is not the way to
 * tidy up data you happen to be able to see.
 */
export const canDeleteOwned = (u: SessionUser, ownerId: number | null | undefined) =>
  can(u, "record.delete") || (ownerId != null && ownerId === u.id);

export const NOT_YOURS = "That record belongs to another rep. Ask them, or a manager, to change it.";

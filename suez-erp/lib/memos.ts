import crypto from "node:crypto";
import type { SessionUser } from "./auth";
import { can } from "./permissions";

// The two document rules live with the other permission predicates, which is
// the module the unit tests can load. Re-exported so call sites import one thing.
export { canEditMemo, isStaleSignature } from "./permissions";

/**
 * Who may read a memo: the people it was addressed to, its author, and HR/admin.
 *
 * Kept here because the rule is applied by the detail page, the printable document
 * and the register — three copies of an access rule is how one of them drifts.
 * Without this, any signed-in employee could read a department-restricted circular
 * by guessing its id.
 */
export function canViewMemo(
  memo: { author_id: number },
  isRecipient: boolean,
  me: SessionUser,
) {
  return isRecipient || memo.author_id === me.id || can(me, "memo.view_any");
}

/** Author, HR and admin only — delivery data is not for recipients. */
export function canViewDelivery(memo: { author_id: number }, me: SessionUser) {
  return memo.author_id === me.id || can(me, "memo.view_any");
}

export const KIND_HEADING: Record<string, string> = {
  memo: "Internal Memorandum",
  circular: "Circular",
  policy: "Policy Document",
  announcement: "Announcement",
};

/**
 * The fingerprint of a document's wording.
 *
 * A signature is only evidence if it can be tied to what was actually signed,
 * so every acknowledgement stores the hash of the body as it stood at that
 * moment. If the document is later revised, the stored hash no longer matches
 * and the register says so instead of quietly implying they agreed to the new
 * text. Taken over the plain-text body, so a purely cosmetic change to the
 * markup does not invalidate a signature.
 */
export const bodyHash = (body: string) => crypto.createHash("sha256").update(body, "utf8").digest("hex");

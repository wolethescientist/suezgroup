/**
 * Document routing vocabulary.
 *
 * Lives outside the actions module because everything exported from a
 * "use server" file has to be an async function — a plain `const` there is a
 * build error, and these are needed by the client components that render the
 * picker and the decision panel.
 */

export const ASKS = [
  {
    key: "review",
    label: "Read it and comment",
    verb: "review",
    hint: "No decision recorded. They can annotate the document and reply.",
  },
  {
    key: "approve",
    label: "Approve or reject it",
    verb: "approve",
    hint: "A decision, with no signature attached.",
  },
  {
    key: "sign",
    label: "Sign it",
    verb: "sign",
    hint: "Their signature is captured and hashed against the wording they signed.",
  },
  {
    key: "approve_sign",
    label: "Approve and sign it",
    verb: "approve and sign",
    hint: "The usual one: a decision, and a signature on the approval.",
  },
] as const;

export type Ask = (typeof ASKS)[number]["key"];

export const ASK_KEYS: readonly string[] = ASKS.map((a) => a.key);
export const askNeedsSignature = (ask: string) => ask === "sign" || ask === "approve_sign";
export const askVerb = (ask: string) => ASKS.find((a) => a.key === ask)?.verb ?? "review";
export const askLabel = (ask: string) => ASKS.find((a) => a.key === ask)?.label ?? "Review";

/** Outcome wording, so the inbox, the document page and the email agree. */
export const ROUTE_STATUS: Record<string, string> = {
  pending: "Awaiting their decision",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Withdrawn",
};

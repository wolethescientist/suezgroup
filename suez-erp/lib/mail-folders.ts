/** A mailbox exactly as advertised by the user's IMAP server. */
export type MailFolder = {
  account_id?: number;
  path: string;
  name: string;
  delimiter: string | null;
  special_use: string | null;
  selectable: boolean;
  subscribed: boolean;
  discovered_at?: string;
};

type ImapFolder = {
  path: string;
  name?: string;
  delimiter?: string | null;
  specialUse?: string;
  flags?: Set<string>;
  subscribed?: boolean;
};

const SPECIAL_ORDER: Record<string, number> = {
  "\\Inbox": 0,
  "\\All": 1,
  "\\Flagged": 2,
  "\\Drafts": 3,
  "\\Sent": 4,
  "\\Archive": 5,
  "\\Junk": 6,
  "\\Trash": 7,
};

const SPECIAL_LABELS: Record<string, string> = {
  "\\Inbox": "Inbox",
  "\\All": "All mail",
  "\\Flagged": "Flagged",
  "\\Drafts": "Drafts",
  "\\Sent": "Sent",
  "\\Archive": "Archive",
  "\\Junk": "Junk",
  "\\Trash": "Trash",
};

/**
 * Turns ImapFlow's LIST response into stable rows without changing provider
 * paths. Paths such as `[Gmail]/Sent Mail` must remain exact because later
 * SELECT/EXAMINE calls use them verbatim.
 */
export function normaliseMailFolders(boxes: ImapFolder[]): MailFolder[] {
  const byPath = new Map<string, MailFolder>();
  for (const box of boxes) {
    const path = box.path;
    if (!path || byPath.has(path)) continue;
    const specialUse = path.toUpperCase() === "INBOX" ? "\\Inbox" : box.specialUse || null;
    byPath.set(path, {
      path,
      name: box.name || path,
      delimiter: box.delimiter || null,
      special_use: specialUse,
      selectable: !box.flags?.has("\\Noselect"),
      subscribed: box.subscribed !== false,
    });
  }
  return sortMailFolders([...byPath.values()]);
}

export function sortMailFolders(folders: MailFolder[]): MailFolder[] {
  return [...folders].sort((a, b) => {
    const ao = a.special_use ? (SPECIAL_ORDER[a.special_use] ?? 50) : 50;
    const bo = b.special_use ? (SPECIAL_ORDER[b.special_use] ?? 50) : 50;
    return ao - bo || a.path.localeCompare(b.path, undefined, { sensitivity: "base" });
  });
}

export function mailFolderLabel(folder: MailFolder): string {
  return (folder.special_use && SPECIAL_LABELS[folder.special_use]) || folder.name || folder.path;
}

export function defaultMailFolder(folders: MailFolder[]): MailFolder | null {
  const selectable = folders.filter((folder) => folder.selectable);
  return (
    selectable.find((folder) => folder.special_use === "\\Inbox") ||
    selectable.find((folder) => folder.path.toUpperCase() === "INBOX") ||
    selectable[0] ||
    null
  );
}

/** Protocol-standard fallback used only until an account has been discovered. */
export const INBOX_FALLBACK: MailFolder = {
  path: "INBOX",
  name: "INBOX",
  delimiter: null,
  special_use: "\\Inbox",
  selectable: true,
  subscribed: true,
};

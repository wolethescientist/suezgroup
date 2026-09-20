import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { accountFor, foldersFor } from "@/lib/mailbox";
import { defaultMailFolder, INBOX_FALLBACK, mailFolderLabel } from "@/lib/mail-folders";
import { fmtDateTime, timeAgo } from "@/lib/format";
import { BtnLink, Card, CardTitle, Empty, PageHeader } from "@/components/ui";
import { ActionForm, SubmitBtn } from "@/components/form";
import { Icon } from "@/components/icons";
import { syncMail } from "@/lib/actions/mail";

export const metadata = { title: "Email" };

export default async function MailPage({ searchParams }: { searchParams: Promise<{ folder?: string; q?: string; sent?: string }> }) {
  const me = await requireUser();
  const { folder: requestedFolder, q = "", sent } = await searchParams;
  const account = await accountFor(me.id);

  if (!account) {
    return (
      <>
        <PageHeader title="Email" subtitle="Read and send your work email without leaving the portal." />
        <Card>
          <Empty title="No mailbox connected yet" hint="Add your IMAP and SMTP details once, and your mail appears here.">
            <BtnLink href="/settings/mailbox" variant="soft" className="mt-2">Connect your mailbox</BtnLink>
          </Empty>
        </Card>
      </>
    );
  }

  const discoveredFolders = await foldersFor(account.id);
  const selectableFolders = discoveredFolders.filter((candidate) => candidate.selectable);
  const folders = selectableFolders.length ? selectableFolders : [INBOX_FALLBACK];
  const fallback = defaultMailFolder(folders)!;
  const selected = folders.find((candidate) => candidate.path === requestedFolder) ?? fallback;
  const folder = selected.path;

  const like = `%${q}%`;
  const messages = await sql<{
    id: number; from_name: string | null; from_email: string | null; subject: string | null;
    snippet: string | null; seen: boolean; flagged: boolean; has_attachments: boolean; sent_at: string | null;
  }>`
    select id, from_name, from_email, subject, snippet, seen, flagged, has_attachments, sent_at
      from mail_messages
     where account_id = ${account.id} and folder = ${folder}
       and (${q} = '' or subject ilike ${like} or from_email ilike ${like} or body_text ilike ${like})
     order by sent_at desc nulls last, uid desc
     limit 100`;

  const counts = await sql<{ folder: string; unread: number; total: number }>`
    select folder, count(*) filter (where not seen)::int as unread, count(*)::int as total
      from mail_messages where account_id = ${account.id} group by folder`;

  return (
    <>
      <PageHeader title="Email" subtitle={`${account.email}${account.last_sync_at ? ` · synced ${timeAgo(account.last_sync_at)}` : " · not synced yet"}`}>
        <ActionForm action={syncMail}>
          <input type="hidden" name="folder" value={folder} />
          <SubmitBtn variant="soft">Sync now</SubmitBtn>
        </ActionForm>
        <BtnLink href="/mail/compose"><Icon name="plus" /> Compose</BtnLink>
      </PageHeader>

      {sent && (
        <p className="mb-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200 ring-inset">
          Message sent.
        </p>
      )}
      {account.last_error && (
        <p className="mb-4 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 ring-1 ring-rose-200 ring-inset">
          Last sync failed: {account.last_error} — check your details in <Link href="/settings/mailbox" className="underline">Settings → Mailbox</Link>.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[200px_1fr]">
        <nav className="space-y-1">
          {folders.map((f) => {
            const c = counts.find((x) => x.folder === f.path);
            const on = folder === f.path;
            const depth = f.delimiter ? Math.min(f.path.split(f.delimiter).length - 1, 3) : 0;
            const icon = f.special_use === "\\Inbox" ? "inbox" : f.special_use === "\\Sent" ? "send" : "folder";
            return (
              <Link key={f.path} href={`/mail?folder=${encodeURIComponent(f.path)}`} title={f.path}
                    className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${on ? "bg-brand-500 text-on-brand" : "text-ink-soft hover:bg-canvas"}`}>
                <span aria-hidden style={{ width: `${depth * 10}px` }} />
                <Icon name={icon} className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{mailFolderLabel(f)}</span>
                {!!c?.unread && <span className={`rounded-full px-1.5 text-[10px] font-bold ${on ? "bg-ink/10" : "bg-brand-100 text-brand-800"}`}>{c.unread}</span>}
              </Link>
            );
          })}
          {!discoveredFolders.length && (
            <p className="px-3 pt-2 text-xs font-medium text-ink-soft">
              Sync or refresh your mailbox to discover every server folder.
            </p>
          )}
        </nav>

        <div>
          <form className="relative mb-3">
            <input type="hidden" name="folder" value={folder} />
            <input name="q" defaultValue={q} placeholder="Search this folder…" className="field pl-9" />
            <Icon name="search" className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-ink-soft" />
          </form>

          {messages.length === 0 ? (
            <Card>
              <Empty title={q ? "Nothing matches that" : "This folder is empty"}
                     hint={q ? "Try a different search." : "Press Sync now to pull mail from the server."} />
            </Card>
          ) : (
            <ul className="card divide-y divide-line overflow-hidden p-0">
              {messages.map((m) => (
                <li key={m.id}>
                  <Link href={`/mail/${m.id}`} className={`flex items-start gap-3 px-4 py-3 transition hover:bg-canvas ${m.seen ? "" : "bg-brand-50/40"}`}>
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${m.seen ? "bg-transparent" : "bg-brand-500"}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className={`truncate text-sm ${m.seen ? "font-semibold" : "font-bold"}`}>
                          {m.from_name || m.from_email || "Unknown sender"}
                        </span>
                        <span className="shrink-0 text-[11px] font-semibold text-ink-soft">{m.sent_at ? timeAgo(m.sent_at) : "—"}</span>
                      </span>
                      <span className={`mt-0.5 block truncate text-sm ${m.seen ? "font-medium" : "font-bold"}`}>
                        {m.flagged && <span className="mr-1 text-amber-500">★</span>}
                        {m.subject || "(no subject)"}
                        {m.has_attachments && <span className="ml-1 text-ink-soft">📎</span>}
                      </span>
                      <span className="mt-0.5 block truncate text-xs font-medium text-ink-soft">{m.snippet ?? ""}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

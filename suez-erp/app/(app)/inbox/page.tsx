import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDateTime, timeAgo } from "@/lib/format";
import { inboxFor } from "@/lib/inbox";
import { clearRead, markAllRead, markRead } from "@/lib/actions/notifications";
import { markRouteSeen } from "@/lib/actions/documents";
import { ActionForm, SubmitBtn } from "@/components/form";
import { Card, CardTitle, Empty, PageHeader, Stat } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";

export const metadata = { title: "Inbox" };

/** Which icon stands for each kind of waiting thing. */
const ICON: Record<string, IconName> = {
  document: "doc",
  memo: "doc",
  leave: "calendar",
  request: "workflow",
  report: "chart",
  timesheet: "clock",
  expense: "cash",
};

/**
 * One place to look.
 *
 * ponytail: a person had to visit Memos, Leave approvals, Requests, Timesheet
 * approvals and Expenses to find out whether anything was waiting on them, and
 * the Notifications page — the one thing that gathered anything — held only a
 * log of events, which emptied itself as soon as it was read.
 */
export default async function InboxPage() {
  const me = await requireUser();

  const [items, notes] = await Promise.all([
    inboxFor(me),
    sql<{
      id: number; title: string; body: string | null; href: string | null; kind: string;
      attachment_id: number | null; action_label: string | null; file_name: string | null;
      read_at: string | null; created_at: string;
    }>`
      select n.id, n.title, n.body, n.href, n.kind, n.attachment_id, n.action_label,
             a.name as file_name, n.read_at, n.created_at
        from notifications n
        left join attachments a on a.id = n.attachment_id
       where n.user_id = ${me.id}
       order by n.created_at desc
       limit 100`,
  ]);

  const unread = notes.filter((n) => !n.read_at).length;
  const urgent = items.filter((i) => i.urgent).length;

  return (
    <>
      <PageHeader
        title="Inbox"
        subtitle={items.length ? `${items.length} thing${items.length === 1 ? "" : "s"} waiting on you.` : "Nothing is waiting on you."}
      >
        {unread > 0 && (
          <ActionForm action={markAllRead}>
            <SubmitBtn variant="outline">Mark all as read</SubmitBtn>
          </ActionForm>
        )}
        {notes.length > unread && (
          <ActionForm action={clearRead}>
            <SubmitBtn variant="ghost">Clear read</SubmitBtn>
          </ActionForm>
        )}
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Waiting on you" value={items.length} tone={items.length ? "amber" : "emerald"} />
        <Stat label="Overdue or urgent" value={urgent} tone={urgent ? "rose" : "brand"} />
        <Stat label="Unread notifications" value={unread} tone="sky" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,24rem)]">
        <Card>
          <CardTitle>Needs you</CardTitle>
          {items.length === 0 ? (
            <Empty title="Nothing outstanding" hint="Approvals, documents to sign and reports due appear here." />
          ) : (
            <ul className="-mx-1 divide-y divide-line">
              {items.map((i) => (
                <li key={i.key} className="flex items-start gap-3 px-1 py-3">
                  <span
                    className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                      i.urgent ? "bg-rose-50 text-rose-700" : "bg-canvas text-ink-soft"
                    }`}
                  >
                    <Icon name={ICON[i.kind] ?? "bell"} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{i.title}</span>
                    <span className="mt-0.5 block text-xs font-medium text-ink-soft">{i.detail}</span>
                    {i.when && (
                      <span className="mt-0.5 block text-[11px] font-semibold text-ink-soft/80" title={fmtDateTime(i.when)}>
                        {timeAgo(i.when)}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {i.dismissRouteId && (
                      <ActionForm action={markRouteSeen}>
                        <input type="hidden" name="id" value={i.dismissRouteId} />
                        <button
                          type="submit"
                          title="Dismiss"
                          className="rounded-lg px-2 py-1.5 text-xs font-bold text-ink-soft hover:bg-canvas hover:text-ink"
                        >
                          Dismiss
                        </button>
                      </ActionForm>
                    )}
                    {i.attachmentId && (
                      <a
                        href={`/api/files/${i.attachmentId}`}
                        title="Download the attachment"
                        className="grid h-8 w-8 place-items-center rounded-lg bg-canvas text-ink-soft hover:bg-line/40 hover:text-ink"
                      >
                        <Icon name="download" className="h-4 w-4" />
                      </a>
                    )}
                    <Link
                      href={i.href}
                      className="rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs font-bold whitespace-nowrap text-brand-700 hover:bg-brand-100"
                    >
                      {i.action}
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle>{unread ? `Notifications · ${unread} unread` : "Notifications"}</CardTitle>
          {notes.length === 0 ? (
            <Empty title="Nothing yet" hint="Circulars, approvals and messages will show up here." />
          ) : (
            <ul className="-mx-1 max-h-[38rem] divide-y divide-line overflow-y-auto">
              {notes.map((n) => (
                <li
                  key={n.id}
                  className={`flex items-start gap-2.5 rounded-lg px-1 py-3 ${n.read_at ? "" : "bg-brand-50/40"}`}
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-line" : "bg-brand-500"}`} />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${n.read_at ? "font-semibold" : "font-bold"}`}>{n.title}</span>
                    {n.body && <span className="mt-0.5 block text-xs font-medium text-ink-soft">{n.body}</span>}
                    <span className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-semibold text-ink-soft/80" title={fmtDateTime(n.created_at)}>
                        {timeAgo(n.created_at)}
                      </span>
                      {n.attachment_id && (
                        <a
                          href={`/api/files/${n.attachment_id}`}
                          className="inline-flex items-center gap-1 rounded-md bg-canvas px-1.5 py-0.5 text-[11px] font-bold text-ink-soft hover:bg-line/40 hover:text-ink"
                        >
                          <Icon name="download" className="h-3 w-3" />
                          {n.file_name ? shorten(n.file_name) : "Download"}
                        </a>
                      )}
                      {n.href && (
                        <Link href={n.href} className="text-[11px] font-bold text-brand-700 hover:underline">
                          {n.action_label ?? "Open"} →
                        </Link>
                      )}
                      {!n.read_at && (
                        <ActionForm action={markRead}>
                          <input type="hidden" name="id" value={n.id} />
                          <button type="submit" className="text-[11px] font-bold text-ink-soft hover:text-ink">
                            Mark read
                          </button>
                        </ActionForm>
                      )}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

const shorten = (name: string) => (name.length > 22 ? `${name.slice(0, 19)}…` : name);

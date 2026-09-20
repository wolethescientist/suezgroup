import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDate, timeAgo } from "@/lib/format";
import { Badge, BtnLink, Card, Empty, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";

export const metadata = { title: "Memos & Circulars" };

type Row = {
  id: number;
  ref: string;
  kind: string;
  title: string;
  body: string;
  priority: string;
  status: string;
  requires_ack: boolean;
  published_at: string | null;
  created_at: string;
  author: string;
  read_at: string | null;
  acknowledged_at: string | null;
  reach: number;
  reads: number;
  acks: number;
};

const TABS = [
  ["inbox", "Addressed to me"],
  ["sent", "Published by me"],
  ["drafts", "My drafts"],
  ["all", "All published"],
] as const;

export default async function MemosPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const me = await requireUser();
  const canSeeAll = can(me, "memo.view_any");
  const { tab = "inbox", q = "" } = await searchParams;
  const like = `%${q}%`;

  const rows =
    tab === "sent" || tab === "drafts"
      ? await sql<Row>`
          select m.*, u.full_name as author, null::timestamptz as read_at, null::timestamptz as acknowledged_at,
                 (select count(*) from memo_recipients r where r.memo_id = m.id)::int as reach,
                 (select count(*) from memo_recipients r where r.memo_id = m.id and r.read_at is not null)::int as reads,
                 (select count(*) from memo_recipients r where r.memo_id = m.id and r.acknowledged_at is not null)::int as acks
            from memos m join users u on u.id = m.author_id
           where m.author_id = ${me.id}
             and m.status = ${tab === "drafts" ? "draft" : "published"}
             and (${q} = '' or m.title ilike ${like} or m.body ilike ${like} or m.ref ilike ${like})
           order by coalesce(m.published_at, m.created_at) desc`
      : tab === "all"
        ? await sql<Row>`
          select m.*, u.full_name as author, null::timestamptz as read_at, null::timestamptz as acknowledged_at,
                 (select count(*) from memo_recipients r where r.memo_id = m.id)::int as reach,
                 (select count(*) from memo_recipients r where r.memo_id = m.id and r.read_at is not null)::int as reads,
                 (select count(*) from memo_recipients r where r.memo_id = m.id and r.acknowledged_at is not null)::int as acks
            from memos m join users u on u.id = m.author_id
           where m.status = 'published'
             and (${q} = '' or m.title ilike ${like} or m.body ilike ${like} or m.ref ilike ${like})
             -- Same rule as opening one: yours, addressed to you, or you hold
             -- the capability to read any. This tab used to list the lot.
             and (${canSeeAll}
                  or m.author_id = ${me.id}
                  or exists (select 1 from memo_recipients r
                              where r.memo_id = m.id and r.user_id = ${me.id}))
           order by m.published_at desc`
        : await sql<Row>`
          select m.*, u.full_name as author, mr.read_at, mr.acknowledged_at,
                 0 as reach, 0 as reads, 0 as acks
            from memo_recipients mr
            join memos m on m.id = mr.memo_id
            join users u on u.id = m.author_id
           where mr.user_id = ${me.id} and m.status = 'published'
             and (${q} = '' or m.title ilike ${like} or m.body ilike ${like} or m.ref ilike ${like})
           order by mr.read_at nulls first, m.published_at desc`;

  const showStats = tab === "sent" || tab === "all";

  return (
    <>
      <PageHeader title="Memos & Circulars" subtitle="Formal documents — memos, circulars and policies. Each gets a reference, a read receipt and, where required, a signature. For a short notice use Announcements.">
        <BtnLink href="/api/export/memos" variant="ghost" prefetch={false}>
          Export CSV
        </BtnLink>
        <BtnLink href="/memos/new">
          <Icon name="plus" /> Compose
        </BtnLink>
      </PageHeader>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 rounded-2xl bg-surface p-1 ring-1 ring-line ring-inset">
          {/* Without memo.view_any this tab is everything they may read, not
              everything published — say so rather than implying they see all. */}
          {TABS.map(([key, label]) => (
            <Link
              key={key}
              href={`/memos?tab=${key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                tab === key ? "bg-brand-500 text-on-brand" : "text-ink-soft hover:bg-canvas"
              }`}
            >
              {key === "all" && !canSeeAll ? "Everything I can see" : label}
            </Link>
          ))}
        </div>
        <form className="relative ml-auto">
          <input type="hidden" name="tab" value={tab} />
          <input name="q" defaultValue={q} placeholder="Search title, body or ref…" className="field pl-9 sm:w-72" />
          <Icon name="search" className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-ink-soft" />
        </form>
      </div>

      {rows.length === 0 ? (
        <Card>
          <Empty title="Nothing here" hint="Try another tab, or compose a new circular." />
        </Card>
      ) : (
        <ul className="grid gap-3">
          {rows.map((m) => (
            <li key={m.id}>
              <Link href={`/memos/${m.id}`} className="card block p-5 card-hover">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {tab === "inbox" && !m.read_at && <span className="h-2 w-2 rounded-full bg-brand-500" />}
                      <h3 className="text-base font-bold">{m.title}</h3>
                      <Badge value={m.kind} />
                      {m.priority !== "normal" && <Badge value={m.priority} />}
                      {m.status === "draft" && <Badge value="draft" />}
                      {m.requires_ack && (
                        <Badge
                          value={m.acknowledged_at ? "approved" : "pending"}
                          label={m.acknowledged_at ? "Acknowledged" : "Signature required"}
                        />
                      )}
                    </div>
                    <p className="mt-1.5 line-clamp-2 max-w-3xl text-sm font-medium text-ink-soft">{m.body}</p>
                    <p className="mt-2 text-xs font-semibold text-ink-soft/80">
                      {m.ref} · {m.author} ·{" "}
                      {m.published_at ? timeAgo(m.published_at) : `drafted ${fmtDate(m.created_at)}`}
                    </p>
                  </div>
                  {showStats && (
                    <div className="flex shrink-0 gap-4 text-center">
                      <div>
                        <p className="text-lg font-bold tabular">
                          {m.reads}
                          <span className="text-ink-soft/60">/{m.reach}</span>
                        </p>
                        <p className="text-[10px] font-bold tracking-wider text-ink-soft uppercase">Read</p>
                      </div>
                      {m.requires_ack && (
                        <div>
                          <p className="text-lg font-bold tabular">
                            {m.acks}
                            <span className="text-ink-soft/60">/{m.reach}</span>
                          </p>
                          <p className="text-[10px] font-bold tracking-wider text-ink-soft uppercase">Signed</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

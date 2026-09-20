import Link from "next/link";
import { requireCap } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDateTime, timeAgo, titleCase } from "@/lib/format";
import { Avatar, BtnLink, Card, Empty, PageHeader, Table, Td } from "@/components/ui";
import { Icon } from "@/components/icons";

export const metadata = { title: "Audit trail" };

const PAGE = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requireCap("audit.view");
  const { q = "", page = "1" } = await searchParams;
  const p = Math.max(1, Number(page) || 1);
  const like = `%${q}%`;

  const [rows, [count]] = await Promise.all([
    sql<{ id: number; action: string; entity: string | null; entity_id: string | null; meta: any; created_at: string; actor: string | null; avatar_url: string | null }>`
      select a.id, a.action, a.entity, a.entity_id, a.meta, a.created_at,
             u.full_name as actor, u.avatar_url
        from audit_log a left join users u on u.id = a.user_id
       where (${q} = '' or a.action ilike ${like} or u.full_name ilike ${like} or a.entity ilike ${like})
       order by a.created_at desc
       limit ${PAGE} offset ${(p - 1) * PAGE}`,
    sql<{ n: number }>`
      select count(*)::int as n from audit_log a left join users u on u.id = a.user_id
       where (${q} = '' or a.action ilike ${like} or u.full_name ilike ${like} or a.entity ilike ${like})`,
  ]);

  const pages = Math.max(1, Math.ceil(count.n / PAGE));

  return (
    <>
      <PageHeader title="Audit trail" subtitle={`${count.n} recorded event${count.n === 1 ? "" : "s"} across the portal.`}>
        <BtnLink href="/api/export/audit-log" variant="outline" prefetch={false}>
          Export CSV
        </BtnLink>
      </PageHeader>

      <form className="relative mb-5">
        <input name="q" defaultValue={q} placeholder="Filter by action, person or entity…" className="field pl-9 sm:w-80" />
        <Icon name="search" className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-ink-soft" />
      </form>

      {rows.length === 0 ? (
        <Card>
          <Empty title="No events" hint="Actions taken in the portal are recorded here." />
        </Card>
      ) : (
        <>
          <Table head={["Who", "Action", "Entity", "Detail", "When"]}>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-canvas">
                <Td>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={r.actor ?? "System"} src={r.avatar_url} size="sm" />
                    <span className="font-bold">{r.actor ?? "System"}</span>
                  </div>
                </Td>
                <Td>
                  <span className="rounded-lg bg-canvas px-2 py-0.5 text-xs font-bold">{r.action}</span>
                </Td>
                <Td className="text-ink-soft">
                  {r.entity ? `${titleCase(r.entity)} ${r.entity_id ?? ""}` : "—"}
                </Td>
                <Td className="max-w-xs truncate text-xs text-ink-soft">
                  {r.meta && Object.keys(r.meta).length ? JSON.stringify(r.meta) : "—"}
                </Td>
                <Td className="whitespace-nowrap text-xs">
                  <span className="font-bold">{timeAgo(r.created_at)}</span>
                  <span className="block text-ink-soft">{fmtDateTime(r.created_at)}</span>
                </Td>
              </tr>
            ))}
          </Table>

          {pages > 1 && (
            <div className="mt-4 flex items-center justify-between gap-3 text-sm font-bold">
              {p > 1 ? (
                <Link href={`/admin/audit?page=${p - 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className="text-brand-700 hover:underline">
                  ← Newer
                </Link>
              ) : (
                <span />
              )}
              <span className="text-ink-soft">
                Page {p} of {pages}
              </span>
              {p < pages ? (
                <Link href={`/admin/audit?page=${p + 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className="text-brand-700 hover:underline">
                  Older →
                </Link>
              ) : (
                <span />
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}

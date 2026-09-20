import { requireCap } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDateTime, timeAgo, titleCase } from "@/lib/format";
import { Avatar, BtnLink, Card, Empty, PageHeader, Table, Td } from "@/components/ui";

export const metadata = { title: "Audit trail" };

/**
 * ponytail: the CRM has always written an audit_log and never had a screen to
 * read it — the data was collected and unreachable, and there was a CSV export
 * behind a URL with nothing linking to it. This is that screen.
 */
export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireCap("audit.view");
  const q = (await searchParams).q?.trim() ?? "";
  const like = `%${q}%`;

  const rows = await sql<{
    id: number; action: string; entity: string | null; entity_id: string | null;
    meta: Record<string, unknown>; created_at: string; who: string | null; who_avatar: string | null;
  }>`
    select a.id, a.action, a.entity, a.entity_id, a.meta, a.created_at,
           u.full_name as who, u.avatar_url as who_avatar
      from audit_log a left join users u on u.id = a.user_id
     where ${q === ""} or a.action ilike ${like} or u.full_name ilike ${like} or a.entity ilike ${like}
     order by a.created_at desc limit 200`;

  const [{ n }] = await sql<{ n: number }>`select count(*)::int as n from audit_log`;

  /** "value: 156,000,000 → 1,000" reads better than a wall of JSON. */
  const describe = (meta: Record<string, unknown>) => {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(meta ?? {})) {
      if (value === null || value === undefined || value === "") continue;
      if (Array.isArray(value) && value.length === 0) continue;
      if (typeof value === "object" && value !== null && "from" in (value as object)) {
        const v = value as { from: unknown; to: unknown };
        parts.push(`${titleCase(key)}: ${String(v.from ?? "—")} → ${String(v.to ?? "—")}`);
      } else {
        parts.push(`${titleCase(key)}: ${String(value)}`);
      }
    }
    return parts;
  };

  return (
    <>
      <PageHeader title="Audit trail" subtitle={`${n} recorded event${n === 1 ? "" : "s"} across the CRM.`}>
        <BtnLink href="/api/export/audit-log" variant="ghost" prefetch={false}>Export CSV</BtnLink>
      </PageHeader>

      <form className="mb-4">
        <input name="q" defaultValue={q} placeholder="Filter by action, person or record type…" className="field sm:w-96" />
      </form>

      {rows.length === 0 ? (
        <Card><Empty title="Nothing recorded yet" hint="Actions across the CRM are logged here as they happen." /></Card>
      ) : (
        <Table head={["Who", "Action", "Record", "Detail", "When"]}>
          {rows.map((r) => {
            const detail = describe(r.meta);
            return (
              <tr key={r.id} className="hover:bg-canvas align-top">
                <Td>
                  <span className="flex items-center gap-2">
                    <Avatar name={r.who ?? "System"} src={r.who_avatar} size="sm" />
                    {r.who ?? "System"}
                  </span>
                </Td>
                <Td className="font-mono text-xs">{r.action}</Td>
                <Td className="text-xs">
                  {r.entity ? `${r.entity}${r.entity_id ? ` #${r.entity_id}` : ""}` : "—"}
                </Td>
                <Td className="text-xs">
                  {detail.length === 0 ? (
                    <span className="text-ink-soft">—</span>
                  ) : (
                    <ul className="space-y-0.5">
                      {detail.map((d) => <li key={d}>{d}</li>)}
                    </ul>
                  )}
                </Td>
                <Td className="text-xs whitespace-nowrap">
                  {timeAgo(r.created_at)}
                  <span className="block text-ink-soft">{fmtDateTime(r.created_at)}</span>
                </Td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}

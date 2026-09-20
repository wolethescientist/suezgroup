import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { timeAgo, titleCase } from "@/lib/format";
import { Badge, Card, CardTitle, Empty, PageHeader, Table, Td } from "@/components/ui";
import { ActionForm, ConfirmBtn, SubmitBtn } from "@/components/form";
import { SegmentForm } from "@/components/sales-forms";
import { deleteSegment, saveSegment } from "@/lib/actions/sales";

export const metadata = { title: "Segments" };

type Rule = { field: string; op: string; value: string };

export default async function SegmentsPage() {
  await requireUser();

  const segments = await sql<{ id: number; name: string; entity: string; rules: Rule[]; created_at: string; owner: string | null }>`
    select s.*, u.full_name as owner from crm_segments s left join users u on u.id = s.owner_id order by s.name`;

  // Counted live rather than stored, so a segment never reports a stale size.
  const sized = await Promise.all(
    segments.map(async (s) => {
      const rules = Array.isArray(s.rules) ? s.rules : [];
      const status = rules.find((r) => r.field === "status")?.value ?? "";
      const industry = rules.find((r) => r.field === "industry")?.value ?? "";
      const health = rules.find((r) => r.field === "health")?.value ?? "";
      const [row] =
        s.entity === "lead"
          ? await sql<{ n: number }>`select count(*)::int as n from crm_leads where (${industry} = '' or industry ilike ${"%" + industry + "%"})`
          : s.entity === "contact"
            ? await sql<{ n: number }>`
                select count(*)::int as n from crm_contacts c left join crm_companies co on co.id = c.company_id
                 where (${status} = '' or co.status = ${status})
                   and (${industry} = '' or co.industry ilike ${"%" + industry + "%"})
                   and (${health} = '' or co.health = ${health})`
            : await sql<{ n: number }>`
                select count(*)::int as n from crm_companies
                 where (${status} = '' or status = ${status})
                   and (${industry} = '' or industry ilike ${"%" + industry + "%"})
                   and (${health} = '' or health = ${health})`;
      return { ...s, size: row?.n ?? 0, rules };
    }),
  );

  return (
    <>
      <PageHeader title="Segments" subtitle="Saved filters your team reuses when targeting an audience.">
        <SegmentForm action={saveSegment} />
      </PageHeader>

      {sized.length === 0 ? (
        <Card><Empty title="No segments saved" hint="Save a filter once and the whole team can reuse it." /></Card>
      ) : (
        <Table head={["Segment", "Over", "Rules", "Matches now", "Saved by", ""]}>
          {sized.map((s) => (
            <tr key={s.id} className="hover:bg-canvas">
              <Td className="font-bold">{s.name}</Td>
              <Td>{titleCase(s.entity)}</Td>
              <Td>
                {s.rules.length === 0 ? (
                  <span className="text-xs text-ink-soft">Everything</span>
                ) : (
                  <span className="flex flex-wrap gap-1">
                    {s.rules.map((r, i) => (
                      <span key={i} className="rounded-lg bg-canvas px-2 py-0.5 text-[11px] font-bold">
                        {r.field} {r.op === "contains" ? "~" : "="} {r.value}
                      </span>
                    ))}
                  </span>
                )}
              </Td>
              <Td className="tabular font-bold">{s.size}</Td>
              <Td className="text-xs">{s.owner ?? "—"}<span className="block text-ink-soft">{timeAgo(s.created_at)}</span></Td>
              <Td>
                <ActionForm action={deleteSegment}>
                  <input type="hidden" name="id" value={s.id} />
                  <ConfirmBtn title={`Delete ${s.name}?`}
                              body="The saved filter is removed. Records it matched are untouched."
                              confirmLabel="Delete segment">
                    Delete
                  </ConfirmBtn>
                </ActionForm>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}

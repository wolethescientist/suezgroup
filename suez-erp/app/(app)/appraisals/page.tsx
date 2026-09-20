import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { Avatar, Badge, Card, CardTitle, Empty, PageHeader, Field, Row, Table, Td } from "@/components/ui";
import { ActionForm, Dialog, SubmitBtn } from "@/components/form";
import { Icon } from "@/components/icons";
import { createCycle } from "@/lib/actions/hr";

export const metadata = { title: "Appraisals" };

export default async function AppraisalsPage() {
  const me = await requireUser();
  const isHr = can(me, "appraisal.cycle");

  const [mine, toReview, cycles] = await Promise.all([
    sql<{ id: number; cycle: string; period_start: string; period_end: string; status: string; self_score: number | null; reviewer_score: number | null; reviewer: string | null }>`
      select a.id, c.name as cycle, c.period_start, c.period_end, a.status, a.self_score, a.reviewer_score, r.full_name as reviewer
        from appraisals a join appraisal_cycles c on c.id = a.cycle_id
        left join users r on r.id = a.reviewer_id
       where a.user_id = ${me.id} order by c.period_end desc`,
    sql<{ id: number; cycle: string; status: string; who: string; who_avatar: string | null; self_score: number | null }>`
      select a.id, c.name as cycle, a.status, u.full_name as who, u.avatar_url as who_avatar, a.self_score
        from appraisals a
        join appraisal_cycles c on c.id = a.cycle_id
        join users u on u.id = a.user_id
       where a.reviewer_id = ${me.id} and a.status <> 'acknowledged'
       order by c.period_end desc, u.full_name`,
    sql<{ id: number; name: string; period_start: string; period_end: string; status: string; n: number; done: number }>`
      select c.*, (select count(*) from appraisals a where a.cycle_id = c.id)::int as n,
             (select count(*) from appraisals a where a.cycle_id = c.id and a.status in ('reviewed','acknowledged'))::int as done
        from appraisal_cycles c order by c.period_end desc`,
  ]);

  return (
    <>
      <PageHeader title="Appraisals" subtitle="Self-review, your manager's review, and the goals behind the score.">
        {isHr && (
          <Dialog label={<><Icon name="plus" /> Open a cycle</>} title="New appraisal cycle"
                  description="Opens an appraisal for every active employee, reviewed by their line manager.">
            <ActionForm action={createCycle} className="space-y-4">
              <Field label="Name"><input name="name" required className="field" placeholder="e.g. 2026 Half-Year Review" /></Field>
              <Row>
                <Field label="Period start"><input name="period_start" type="date" required className="field" /></Field>
                <Field label="Period end"><input name="period_end" type="date" required className="field" /></Field>
              </Row>
              <SubmitBtn className="w-full">Open cycle</SubmitBtn>
            </ActionForm>
          </Dialog>
        )}
      </PageHeader>
      <Card className="mb-5"><CardTitle>How appraisals work</CardTitle><p className="text-sm font-medium text-ink-soft">HR opens a review cycle for a period. You record your achievements, progress on goals, and a self-score. Your assigned reviewer adds their assessment and score. You can then acknowledge the final review. The goal is a documented conversation about performance, development, and priorities — not a hidden ranking.</p></Card>

      <Card className="mb-5">
        <CardTitle>Your appraisals</CardTitle>
        {mine.length === 0 ? (
          <Empty title="Nothing open" hint="When HR opens a review cycle, your appraisal appears here." />
        ) : (
          <Table head={["Cycle", "Period", "Reviewer", "Self", "Reviewer score", "Status"]}>
            {mine.map((a) => (
              <tr key={a.id} className="hover:bg-canvas">
                <Td><Link href={`/appraisals/${a.id}`} className="font-bold text-brand-700 hover:underline">{a.cycle}</Link></Td>
                <Td className="text-xs">{fmtDate(a.period_start)} → {fmtDate(a.period_end)}</Td>
                <Td>{a.reviewer ?? "—"}</Td>
                <Td className="tabular">{a.self_score ?? "—"}</Td>
                <Td className="tabular">{a.reviewer_score ?? "—"}</Td>
                <Td><Badge value={a.status} /></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {toReview.length > 0 && (
        <Card className="mb-5">
          <CardTitle>Reviews you owe</CardTitle>
          <Table head={["Employee", "Cycle", "Their self-score", "Status", ""]}>
            {toReview.map((a) => (
              <tr key={a.id} className="hover:bg-canvas">
                <Td><span className="flex items-center gap-2"><Avatar name={a.who} src={a.who_avatar} size="sm" />{a.who}</span></Td>
                <Td>{a.cycle}</Td>
                <Td className="tabular">{a.self_score ?? "—"}</Td>
                <Td><Badge value={a.status} /></Td>
                <Td><Link href={`/appraisals/${a.id}`} className="text-xs font-bold text-brand-700 hover:underline">Open →</Link></Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {isHr && cycles.length > 0 && (
        <Card>
          <CardTitle>Cycles</CardTitle>
          <ul className="divide-y divide-line">
            {cycles.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <span className="flex-1 font-bold">{c.name}</span>
                <span className="text-xs font-semibold text-ink-soft">{fmtDate(c.period_start)} → {fmtDate(c.period_end)}</span>
                <span className="tabular text-xs font-bold">{c.done} / {c.n} reviewed</span>
                <Badge value={c.status} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

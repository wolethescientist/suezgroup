import Link from "next/link";
import { can, canApproveLeave, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDate, timeAgo } from "@/lib/format";
import { Badge, BtnLink, Card, CardTitle, Empty, PageHeader, Table, Td } from "@/components/ui";
import { Icon } from "@/components/icons";

export const metadata = { title: "Leave" };

export default async function LeavePage() {
  const me = await requireUser();
  const year = new Date().getFullYear();

  const [balances, requests, pending] = await Promise.all([
    sql<{ name: string; color: string; entitled: string; used: string }>`
      select lt.name, lt.color,
             coalesce(lb.entitled, lt.default_days) as entitled,
             coalesce(lb.used, 0) as used
        from leave_types lt
        left join leave_balances lb on lb.leave_type_id = lt.id and lb.user_id = ${me.id} and lb.year = ${year}
       order by lt.name`,
    sql<{ id: number; ref: string; type: string; start_date: string; end_date: string; days: string; status: string; created_at: string; approver: string | null }>`
      select lr.id, lr.ref, lt.name as type, lr.start_date, lr.end_date, lr.days, lr.status, lr.created_at,
             a.full_name as approver
        from leave_requests lr
        join leave_types lt on lt.id = lr.leave_type_id
        left join users a on a.id = lr.approver_id
       where lr.user_id = ${me.id}
       order by lr.created_at desc`,
    canApproveLeave(me)
      ? sql<{ n: number }>`
          select count(*)::int as n from leave_requests lr join users u on u.id = lr.user_id
           where lr.status = 'pending' and (${can(me, "leave.approve_any")} or u.manager_id = ${me.id})`
      : Promise.resolve([{ n: 0 }]),
  ]);

  return (
    <>
      <PageHeader title="Leave" subtitle={`Your ${year} entitlement, requests and history.`}>
        {canApproveLeave(me) && (
          <BtnLink href="/leave/approvals" variant="outline">
            Approvals {pending[0].n > 0 && <span className="rounded-full bg-brand-100 px-1.5 text-brand-700">{pending[0].n}</span>}
          </BtnLink>
        )}
        <BtnLink href="/api/export/leave-requests" variant="ghost" prefetch={false}>
          Export CSV
        </BtnLink>
        <BtnLink href="/leave/new">
          <Icon name="plus" /> Apply for leave
        </BtnLink>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {balances.map((b) => {
          const entitled = Number(b.entitled);
          const used = Number(b.used);
          const pct = entitled ? Math.min(100, (used / entitled) * 100) : 0;
          return (
            <div key={b.name} className="card p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold">{b.name}</p>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />
              </div>
              <p className="mt-2 text-2xl font-bold tabular">
                {entitled - used}
                <span className="text-sm font-semibold text-ink-soft"> / {entitled} days</span>
              </p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-canvas">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: b.color }} />
              </div>
              <p className="mt-1.5 text-[11px] font-semibold text-ink-soft">{used} day(s) taken</p>
            </div>
          );
        })}
      </div>

      <div className="mt-6">
        <CardTitle>My requests</CardTitle>
        {requests.length === 0 ? (
          <Card>
            <Empty title="No leave requests yet" hint="Apply for leave and it will be routed to your approver.">
              <BtnLink href="/leave/new" className="mt-2" variant="soft">
                Apply now
              </BtnLink>
            </Empty>
          </Card>
        ) : (
          <Table head={["Reference", "Type", "Dates", "Days", "Status", "Approver", ""]}>
            {requests.map((r) => (
              <tr key={r.id} className="hover:bg-canvas">
                <Td>
                  <span className="font-bold">{r.ref}</span>
                  <span className="block text-[11px] font-medium text-ink-soft">{timeAgo(r.created_at)}</span>
                </Td>
                <Td>{r.type}</Td>
                <Td className="whitespace-nowrap">
                  {fmtDate(r.start_date)} – {fmtDate(r.end_date)}
                </Td>
                <Td className="tabular">{Number(r.days)}</Td>
                <Td>
                  <Badge value={r.status} />
                </Td>
                <Td className="text-ink-soft">{r.approver ?? "—"}</Td>
                <Td className="text-right">
                  <Link href={`/leave/${r.id}`} className="text-xs font-bold text-brand-700 hover:underline">
                    Open
                  </Link>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </>
  );
}

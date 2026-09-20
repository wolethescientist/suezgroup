import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { applyLeave } from "@/lib/actions/leave";
import { LeaveForm } from "@/components/leave-form";
import { PageHeader } from "@/components/ui";
import Link from "next/link";

export const metadata = { title: "Apply for leave" };

export default async function NewLeavePage() {
  const me = await requireUser();
  const year = new Date().getFullYear();

  const [types, colleagues] = await Promise.all([
    sql<{ id: number; name: string; remaining: number; paid: boolean }>`
      select lt.id, lt.name, lt.paid,
             coalesce(lb.entitled, lt.default_days) - coalesce(lb.used, 0) as remaining
        from leave_types lt
        left join leave_balances lb on lb.leave_type_id = lt.id and lb.user_id = ${me.id} and lb.year = ${year}
       order by lt.name`,
    sql<{ id: number; full_name: string }>`
      select id, full_name from users where status = 'active' and id <> ${me.id} order by full_name`,
  ]);

  return (
    <>
      <PageHeader title="Apply for leave" subtitle="Requests are checked against your entitlement before they are routed.">
        <Link href="/leave" className="rounded-xl px-3 py-2 text-xs font-bold text-ink-soft hover:bg-canvas hover:text-ink">← My leave</Link>
      </PageHeader>
      <LeaveForm action={applyLeave} types={types.map((t) => ({ ...t, remaining: Number(t.remaining) }))} colleagues={colleagues} />
    </>
  );
}

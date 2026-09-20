import { requireUser } from "@/lib/auth";
import { canIssuePolicy, canPublishMemo } from "@/lib/permissions";
import { sql } from "@/lib/db";
import { saveMemo } from "@/lib/actions/memos";
import { MemoComposer } from "@/components/memo-composer";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Compose memo" };

export default async function NewMemoPage() {
  const me = await requireUser();
  const [departments, people] = await Promise.all([
    sql<{ id: number; name: string }>`select id, name from departments order by name`,
    sql<{ id: number; full_name: string; department: string | null }>`
      select u.id, u.full_name, d.name as department
        from users u left join departments d on d.id = u.department_id
       where u.status = 'active' order by u.full_name`,
  ]);

  return (
    <>
      <PageHeader title="Compose" subtitle="Memos and circulars are delivered to the portal, and by email when SMTP is configured." />
      <MemoComposer action={saveMemo} departments={departments} people={people}
                    canIssueFormal={canIssuePolicy(me)} canPublish={canPublishMemo(me)} />
    </>
  );
}

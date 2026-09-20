import { requireCap } from "@/lib/auth";
import { sql } from "@/lib/db";
import { deleteDepartment } from "@/lib/actions/admin";
import { ActionForm, ConfirmBtn, Dialog } from "@/components/form";
import { DepartmentForm } from "@/components/admin-forms";
import { Avatar, Card, Empty, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";

export const metadata = { title: "Departments" };

export default async function DepartmentsAdmin() {
  await requireCap("people.departments");

  const [rows, heads] = await Promise.all([
    sql<{ id: number; name: string; code: string | null; head_id: number | null; head: string | null; head_avatar: string | null; staff: number; on_leave: number }>`
      select d.id, d.name, d.code, d.head_id, h.full_name as head, h.avatar_url as head_avatar,
             (select count(*) from users u where u.department_id = d.id and u.status = 'active')::int as staff,
             (select count(*) from leave_requests lr join users u on u.id = lr.user_id
               where u.department_id = d.id and lr.status = 'approved'
                 and current_date between lr.start_date and lr.end_date)::int as on_leave
        from departments d left join users h on h.id = d.head_id
       order by d.name`,
    sql<{ id: number; name: string }>`select id, full_name as name from users where status = 'active' order by full_name`,
  ]);

  return (
    <>
      <PageHeader title="Departments" subtitle="Cost centres and reporting structure. Memos can be addressed to a whole department.">
        <Dialog label={<><Icon name="plus" /> Add department</>} title="Add department">
          <DepartmentForm heads={heads} />
        </Dialog>
      </PageHeader>

      {rows.length === 0 ? (
        <Card>
          <Empty title="No departments yet" hint="Add your first department to organise staff records." />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((d) => (
            <Card key={d.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-bold">{d.name}</h3>
                  <p className="text-xs font-semibold text-ink-soft">{d.code ?? "No code"}</p>
                </div>
                <span className="rounded-xl bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">
                  {d.staff} staff
                </span>
              </div>

              <div className="mt-4 flex items-center gap-3 border-t border-line pt-4">
                <Avatar name={d.head ?? "?"} src={d.head_avatar} size="md" />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold tracking-wider text-ink-soft uppercase">Head of department</p>
                  <p className="truncate text-sm font-bold">{d.head ?? "Not appointed"}</p>
                </div>
              </div>

              <p className="mt-3 text-xs font-semibold text-ink-soft">
                {d.on_leave} on leave today
              </p>

              <div className="mt-4 flex gap-2">
                <Dialog label="Edit" variant="outline" className="flex-1" title={`Edit ${d.name}`}>
                  <DepartmentForm heads={heads} record={d} />
                </Dialog>
                <ActionForm action={deleteDepartment} className="flex-1">
                  <input type="hidden" name="id" value={d.id} />
                  <ConfirmBtn
                    className="w-full !text-rose-600"
                    title={`Delete ${d.name}?`}
                    body={`This removes the department and unsets it on any record that points at it. Departments with staff cannot be deleted — move the ${d.staff} employee(s) first.`}
                    confirmLabel="Delete department"
                    confirmWord={d.name}
                  >
                    Delete
                  </ConfirmBtn>
                </ActionForm>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

import { can, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDate, timeAgo, titleCase } from "@/lib/format";
import { Avatar, Badge, Card, Empty, PageHeader } from "@/components/ui";
import { ActionForm, ConfirmBtn } from "@/components/form";
import { AnnouncementForm } from "@/components/erp-forms";
import { deleteAnnouncement, postAnnouncement } from "@/lib/actions/hr";

export const metadata = { title: "Announcements" };

type Row = {
  id: number; title: string; body: string; category: string; priority: string; pinned: boolean;
  publish_at: string; expires_at: string | null; author: string | null; author_avatar: string | null;
  department: string | null;
};

export default async function AnnouncementsPage() {
  const me = await requireUser();
  const canPost = ["admin", "hr", "manager"].includes(me.role);

  // Live = published, not expired, and either org-wide or for my department.
  const rows = await sql<Row>`
    select a.id, a.title, a.body, a.category, a.priority, a.pinned, a.publish_at, a.expires_at,
           u.full_name as author, u.avatar_url as author_avatar, d.name as department
      from announcements a
      left join users u on u.id = a.author_id
      left join departments d on d.id = a.department_id
     where a.publish_at <= now()
       and (a.expires_at is null or a.expires_at > now())
       and (a.audience = 'all' or a.department_id = ${me.department_id})
     order by a.pinned desc, a.publish_at desc
     limit 100`;

  return (
    <>
      <PageHeader title="Announcements" subtitle="The noticeboard — short notices that expire. Pinned items stay at the top. Anything that needs a reference number or a signature belongs in Memos & Circulars.">
        {canPost && <AnnouncementForm action={postAnnouncement} departments={
          (await sql<{ id: number; name: string }>`select id, name from departments order by name`).map((d) => ({ id: d.id, label: d.name }))
        } />}
      </PageHeader>

      {rows.length === 0 ? (
        <Card><Empty title="Nothing announced" hint="When something is posted for you or your department, it appears here." /></Card>
      ) : (
        <ul className="grid gap-3">
          {rows.map((a) => (
            <li key={a.id}>
              <Card className={a.pinned ? "border-brand-300 bg-brand-50/40" : ""}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {a.pinned && <Badge value="pinned" label="Pinned" />}
                      <h3 className="font-bold">{a.title}</h3>
                      <Badge value={a.category} label={a.category.toUpperCase()} />
                      {a.priority !== "normal" && <Badge value={a.priority} />}
                    </div>
                    <p className="mt-2 text-sm leading-relaxed font-medium whitespace-pre-wrap">{a.body}</p>
                    <p className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-ink-soft">
                      <Avatar name={a.author ?? "?"} src={a.author_avatar} size="sm" />
                      {a.author ?? "Unknown"} · {timeAgo(a.publish_at)}
                      {a.department ? ` · ${a.department} only` : ""}
                      {a.expires_at ? ` · until ${fmtDate(a.expires_at)}` : ""}
                    </p>
                  </div>
                  {can(me, "announcement.manage") && (
                    <ActionForm action={deleteAnnouncement}>
                      <input type="hidden" name="id" value={a.id} />
                      <ConfirmBtn
                        title="Remove this announcement?"
                        body={`"${a.title}" will no longer appear on the noticeboard. This cannot be undone.`}
                        confirmLabel="Remove"
                      >
                        Remove
                      </ConfirmBtn>
                    </ActionForm>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

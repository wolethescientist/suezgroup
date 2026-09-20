import { requireUser } from "@/lib/auth";
import Link from "next/link";
import { sql } from "@/lib/db";
import { startConversation } from "@/lib/actions/messages";
import { ActionForm, Dialog, SubmitBtn } from "@/components/form";
import { ConversationList, type ConvSummary } from "@/components/conversation-list";
import { Field } from "@/components/ui";
import { Icon } from "@/components/icons";

export const metadata = { title: "Messages" };

export default async function MessagesLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();

  const [items, people] = await Promise.all([
    sql<ConvSummary>`
      select c.id, c.subject, c.is_group,
             (select string_agg(u.full_name, ', ' order by u.full_name)
                from conversation_members m2 join users u on u.id = m2.user_id
               where m2.conversation_id = c.id and m2.user_id <> ${me.id}) as names,
             (select body from messages m where m.conversation_id = c.id order by created_at desc limit 1) as last_body,
             (select created_at from messages m where m.conversation_id = c.id order by created_at desc limit 1) as last_at,
             (select count(*) from messages m
               where m.conversation_id = c.id and m.sender_id <> ${me.id}
                 and (cm.last_read_at is null or m.created_at > cm.last_read_at))::int as unread
        from conversations c
        join conversation_members cm on cm.conversation_id = c.id and cm.user_id = ${me.id}
       order by last_at desc nulls last`,
    sql<{ id: number; full_name: string; job_title: string | null }>`
      select id, full_name, job_title from users where status = 'active' and id <> ${me.id} order by full_name`,
  ]);

  return (
    <div className="grid gap-4 lg:h-[calc(100dvh-9rem)] lg:grid-cols-[320px_1fr]">
      <aside className="card flex min-h-0 flex-col overflow-hidden p-0">
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h1 className="text-sm font-bold">Messages</h1>
          <Dialog
            label={<Icon name="plus" />}
            variant="soft"
            className="!px-2 !py-1.5"
            title="New conversation"
            description="Pick one colleague for a direct chat, or several for a group."
          >
            <Link href="/messages/new" className="mb-3 block rounded-xl bg-canvas px-3 py-2 text-center text-sm font-bold text-brand-700 hover:bg-brand-50">Use the full composer</Link>
            <ActionForm action={startConversation} className="space-y-4">
              <Field label="To" hint="Hold Ctrl / Cmd to select more than one.">
                <select name="members" multiple required size={8} className="field">
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name} — {p.job_title ?? "Staff"}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Subject" hint="Optional — useful for group threads.">
                <input name="subject" className="field" placeholder="e.g. Q3 budget review" />
              </Field>
              <Field label="Message">
                <textarea name="body" required rows={4} className="field resize-y" placeholder="Say something…" />
              </Field>
              <SubmitBtn className="w-full">Start conversation</SubmitBtn>
            </ActionForm>
          </Dialog>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ConversationList items={items} />
        </div>
      </aside>

      <section className="card flex min-h-0 flex-col overflow-hidden p-0">{children}</section>
    </div>
  );
}

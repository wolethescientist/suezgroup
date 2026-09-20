import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDate, fmtTime } from "@/lib/format";
import { prettySize } from "@/lib/attachments";
import { markConversationRead, sendMessage } from "@/lib/actions/messages";
import { ActionForm, SubmitBtn } from "@/components/form";
import { Avatar } from "@/components/ui";
import { Icon } from "@/components/icons";

export default async function Thread({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const id = Number((await params).id);
  if (!id) notFound();

  const [convo] = await sql<{ id: number; subject: string | null; is_group: boolean; names: string | null; member_count: number }>`
    select c.id, c.subject, c.is_group,
           (select string_agg(u.full_name, ', ' order by u.full_name)
              from conversation_members m2 join users u on u.id = m2.user_id
             where m2.conversation_id = c.id and m2.user_id <> ${me.id}) as names,
           (select count(*) from conversation_members m3 where m3.conversation_id = c.id)::int as member_count
      from conversations c
      join conversation_members cm on cm.conversation_id = c.id and cm.user_id = ${me.id}
     where c.id = ${id}`;
  if (!convo) notFound();

  const messages = await sql<{
    id: number; body: string; created_at: string; sender_id: number; sender: string; avatar_url: string | null;
    file_id: number | null; file_name: string | null; file_size: number | null;
  }>`
    select m.id, m.body, m.created_at, m.sender_id, u.full_name as sender, u.avatar_url,
           a.id as file_id, a.name as file_name, a.size_bytes as file_size
      from messages m
      join users u on u.id = m.sender_id
      left join attachments a on a.id = m.attachment_id
     where m.conversation_id = ${id}
     order by m.created_at`;

  await markConversationRead(id);

  let lastDay = "";

  return (
    <>
      <header className="flex items-center gap-3 border-b border-line px-5 py-3">
        <Avatar name={convo.is_group ? (convo.subject ?? "Group") : (convo.names ?? "?")} size="md" />
        <div className="min-w-0">
          <h1 className="truncate text-sm font-bold">{convo.subject || convo.names || "Conversation"}</h1>
          <p className="truncate text-xs font-medium text-ink-soft">
            {convo.is_group ? `${convo.member_count} participants · ${convo.names}` : convo.names}
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-5 py-4">
        {messages.map((m) => {
          const mine = m.sender_id === me.id;
          const day = fmtDate(m.created_at);
          const divider = day !== lastDay;
          lastDay = day;
          return (
            <div key={m.id}>
              {divider && (
                <p className="my-4 text-center text-[10px] font-bold tracking-wider text-ink-soft uppercase">{day}</p>
              )}
              <div className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                {!mine && <Avatar name={m.sender} src={m.avatar_url} size="sm" />}
                <div className={`max-w-[75%] ${mine ? "items-end text-right" : ""}`}>
                  {convo.is_group && !mine && <p className="mb-0.5 text-[10px] font-bold text-ink-soft">{m.sender}</p>}
                  <div
                    className={`inline-block rounded-2xl px-3.5 py-2 text-sm font-medium ${
                      mine ? "bg-brand-500 text-on-brand" : "bg-canvas text-ink"
                    }`}
                  >
                    {m.body && <p className="whitespace-pre-wrap text-left">{m.body}</p>}
                    {m.file_id && (
                      <a
                        href={`/api/files/${m.file_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className={`mt-1 flex items-center gap-2 rounded-xl px-2 py-1.5 text-xs font-bold ${
                          mine ? "bg-ink/10 hover:bg-brand-500/25" : "bg-surface ring-1 ring-line ring-inset hover:bg-brand-50"
                        }`}
                      >
                        <Icon name="clip" className="h-3.5 w-3.5" />
                        <span className="truncate">{m.file_name}</span>
                        <span className="opacity-70">{prettySize(m.file_size ?? 0)}</span>
                      </a>
                    )}
                  </div>
                  <p className="mt-0.5 text-[10px] font-semibold text-ink-soft">{fmtTime(m.created_at)}</p>
                </div>
              </div>
            </div>
          );
        })}
        {messages.length === 0 && <p className="py-10 text-center text-sm font-medium text-ink-soft">Say hello 👋</p>}
      </div>

      <ActionForm action={sendMessage} reset className="border-t border-line p-3">
        <input type="hidden" name="conversation_id" value={id} />
        <div className="flex items-end gap-2">
          <label className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-xl bg-canvas text-ink-soft hover:bg-brand-50 hover:text-brand-700" title="Attach a file">
            <Icon name="clip" />
            <input type="file" name="attachment" className="hidden" />
          </label>
          <textarea name="body" rows={1} placeholder="Write a message…" className="field max-h-32 min-h-10 flex-1 resize-y py-2.5" />
          <SubmitBtn className="h-10 shrink-0">
            <Icon name="send" />
            <span className="hidden sm:inline">Send</span>
          </SubmitBtn>
        </div>
      </ActionForm>
    </>
  );
}

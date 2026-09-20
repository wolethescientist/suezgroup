"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { notify } from "@/lib/audit";
import { saveUpload } from "@/lib/attachments";

const str = (fd: FormData, k: string) => (fd.get(k) ?? "").toString().trim();

export async function startConversation(fd: FormData) {
  const me = await requireUser();
  const members = fd.getAll("members").map(Number).filter(Boolean);
  const body = str(fd, "body");
  if (!members.length) return { error: "Choose at least one colleague." };
  if (!body) return { error: "Write your first message." };

  const all = [...new Set([me.id, ...members])];
  let conversationId: number | undefined;

  // Reuse an existing one-to-one thread rather than piling up duplicates.
  if (all.length === 2) {
    const [existing] = await sql<{ id: number }>`
      select c.id from conversations c
        join conversation_members a on a.conversation_id = c.id and a.user_id = ${all[0]}
        join conversation_members b on b.conversation_id = c.id and b.user_id = ${all[1]}
       where c.is_group = false
         and (select count(*) from conversation_members m where m.conversation_id = c.id) = 2
       limit 1`;
    conversationId = existing?.id;
  }

  if (!conversationId) {
    const [c] = await sql<{ id: number }>`
      insert into conversations (subject, is_group, created_by)
      values (${str(fd, "subject") || null}, ${all.length > 2}, ${me.id}) returning id`;
    conversationId = c.id;
    await sql`
      insert into conversation_members (conversation_id, user_id)
      select ${conversationId}, id from users where id = any(${all}::int[])
      on conflict do nothing`;
  }

  await sql`insert into messages (conversation_id, sender_id, body) values (${conversationId}, ${me.id}, ${body})`;
  await notify(members, `New message from ${me.full_name}`, body.slice(0, 120), `/messages/${conversationId}`);
  revalidatePath("/messages");
  redirect(`/messages/${conversationId}`);
}

export async function sendMessage(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "conversation_id"));
  const body = str(fd, "body");

  let attachmentId: number | null = null;
  try {
    attachmentId = await saveUpload(fd.get("attachment"), me.id);
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (!body && !attachmentId) return { error: "Nothing to send." };

  const [member] = await sql<{ user_id: number }>`
    select user_id from conversation_members where conversation_id = ${id} and user_id = ${me.id}`;
  if (!member) return { error: "You are not in this conversation." };

  await sql`
    insert into messages (conversation_id, sender_id, body, attachment_id)
    values (${id}, ${me.id}, ${body}, ${attachmentId})`;
  await sql`
    update conversation_members set last_read_at = now() where conversation_id = ${id} and user_id = ${me.id}`;

  const others = (
    await sql<{ user_id: number }>`select user_id from conversation_members where conversation_id = ${id} and user_id <> ${me.id}`
  ).map((r) => r.user_id);
  await notify(others, `New message from ${me.full_name}`, body.slice(0, 120) || "Sent an attachment", `/messages/${id}`);

  revalidatePath(`/messages/${id}`);
  revalidatePath("/messages");
  return { ok: true };
}

/** Called while rendering a thread. */
/**
 * Clears the unread marker for the signed-in member of a conversation.
 * The member is taken from the session — see touchMemo for why an argument
 * would not do.
 */
export async function markConversationRead(conversationId: number) {
  const me = await requireUser();
  await sql`
    update conversation_members set last_read_at = now()
     where conversation_id = ${conversationId} and user_id = ${me.id}`;
}

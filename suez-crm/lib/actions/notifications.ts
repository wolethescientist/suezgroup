"use server";

import { revalidatePath } from "next/cache";
import { sql } from "../db";
import { requireUser } from "../auth";

export async function markAllRead() {
  const me = await requireUser();
  await sql`update notifications set read_at = now() where user_id = ${me.id} and read_at is null`;
  revalidatePath("/inbox");
  revalidatePath("/", "layout");
  return { ok: true };
}

/** One row, from the inbox's own quick action. */
export async function markRead(fd: FormData) {
  const me = await requireUser();
  const id = Number((fd.get("id") ?? "").toString());
  if (!id) return { error: "Which notification?" };
  await sql`
    update notifications set read_at = now()
     where id = ${id} and user_id = ${me.id} and read_at is null`;
  revalidatePath("/inbox");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function clearRead() {
  const me = await requireUser();
  await sql`delete from notifications where user_id = ${me.id} and read_at is not null`;
  revalidatePath("/inbox");
  return { ok: true };
}

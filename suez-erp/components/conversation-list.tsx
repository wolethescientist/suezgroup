"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "@/components/ui";
import { timeAgo } from "@/lib/format";

export type ConvSummary = {
  id: number;
  subject: string | null;
  is_group: boolean;
  names: string;
  last_body: string | null;
  last_at: string | null;
  unread: number;
};

export function ConversationList({ items }: { items: ConvSummary[] }) {
  const path = usePathname();

  if (!items.length)
    return <p className="px-4 py-8 text-center text-sm font-medium text-ink-soft">No conversations yet.</p>;

  return (
    <ul className="divide-y divide-line">
      {items.map((c) => {
        const on = path === `/messages/${c.id}`;
        const title = c.subject || c.names;
        return (
          <li key={c.id}>
            <Link href={`/messages/${c.id}`} className={`flex gap-3 px-4 py-3 transition ${on ? "bg-brand-50" : "hover:bg-canvas"}`}>
              <Avatar name={c.is_group ? (c.subject ?? "Group") : c.names} size="md" />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`truncate text-sm ${c.unread ? "font-bold" : "font-semibold"}`}>{title}</span>
                  <span className="shrink-0 text-[10px] font-semibold text-ink-soft">{c.last_at ? timeAgo(c.last_at) : ""}</span>
                </span>
                <span className="mt-0.5 flex items-center gap-2">
                  <span className={`min-w-0 flex-1 truncate text-xs ${c.unread ? "font-semibold text-ink" : "font-medium text-ink-soft"}`}>
                    {c.last_body || "No messages yet"}
                  </span>
                  {!!c.unread && (
                    <span className="grid h-4 min-w-4 shrink-0 place-items-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
                      {c.unread}
                    </span>
                  )}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

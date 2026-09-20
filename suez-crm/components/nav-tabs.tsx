"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavTabs({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="mb-6 flex flex-wrap gap-1 rounded-2xl bg-surface p-1 ring-1 ring-line ring-inset sm:w-fit">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
            path === i.href ? "bg-brand-500 text-on-brand" : "text-ink-soft hover:bg-canvas"
          }`}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

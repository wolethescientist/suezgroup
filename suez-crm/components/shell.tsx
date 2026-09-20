"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { Avatar } from "./ui";
import { ThemeToggle } from "./theme-toggle";
import { logout } from "../lib/actions/auth";
import { timeAgo } from "../lib/format";

/** Each app supplies its own badge counts; keys are referenced by nav items. */
export type Counts = Record<string, number>;
type Note = { id: number; title: string; body: string | null; href: string | null; created_at: string };
type ShellUser = { id: number; full_name: string; email: string; role: string; role_name?: string; job_title: string | null; avatar_url: string | null; capabilities: string[] };

/** `caps` narrows a single item; a group-level `caps` narrows the whole group. */
export type Item = { href: string; label: string; icon: IconName; count?: string; exact?: boolean; caps?: string[] };
export type Group = { label: string; items: Item[]; caps?: string[] };

export function Shell({
  user,
  org,
  counts,
  notes,
  groups,
  product,
  sibling,
  searchPlaceholder = "Search…",
  children,
}: {
  user: ShellUser;
  org: string;
  counts: Counts;
  notes: Note[];
  /** Sidebar navigation for this app. Each app owns its own. */
  groups: Group[];
  /** Product name shown under the org, e.g. "ERP" or "CRM". */
  product: string;
  /** Cross-link to the other app; the session cookie is shared so it lands signed in. */
  sibling?: { label: string; href: string };
  searchPlaceholder?: string;
  children: ReactNode;
}) {
  const path = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState<null | "user" | "bell">(null);

  useEffect(() => {
    setDrawer(false);
    setMenu(null);
  }, [path]);

  const active = (i: Item) => (i.exact ? path === i.href : path === i.href || path.startsWith(i.href + "/"));

  const nav = (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {groups
        .filter((g) => !g.caps || g.caps.some((c) => user.capabilities.includes(c)))
        // Hide items the server would bounce them from anyway.
        .map((g) => ({ ...g, items: g.items.filter((i) => !i.caps || i.caps.some((c) => user.capabilities.includes(c))) }))
        .filter((g) => g.items.length > 0)
        .map((g) => (
        <details key={g.label} open={g.items.some(active)} className="group/nav">
          <summary className="mb-1 flex cursor-pointer list-none items-center justify-between rounded-lg px-3 py-1.5 text-[10px] font-bold tracking-[0.12em] text-ink-soft/60 uppercase hover:bg-canvas hover:text-ink-soft">
            {g.label}<span className="text-sm leading-none transition-transform group-open/nav:rotate-90">›</span>
          </summary>
          <ul className="space-y-px">
            {g.items.map((i) => {
              const on = active(i);
              const n = i.count ? (counts[i.count] ?? 0) : 0;
              return (
                <li key={i.href}>
                  {/*
                    ponytail: the selected item was a solid brand-orange block
                    with a coloured shadow. At 17 items down a sidebar that is a
                    slab of the loudest colour in the product sitting next to
                    everything you are trying to read, and it made the whole
                    interface feel shouty. A tinted pill with a rail down its
                    left edge says the same thing quietly.
                  */}
                  <Link
                    href={i.href}
                    aria-current={on ? "page" : undefined}
                    className={`group relative flex items-center gap-3 rounded-lg py-2 pr-2.5 pl-3 text-sm transition-colors duration-150 ${
                      on
                        ? "bg-brand-50 font-bold text-brand-800"
                        : "font-semibold text-ink-soft hover:bg-canvas hover:text-ink"
                    }`}
                  >
                    {on && (
                      <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-brand-500" aria-hidden />
                    )}
                    <Icon
                      name={i.icon}
                      className={`h-[18px] w-[18px] shrink-0 transition-colors ${
                        on ? "text-brand-600" : "text-ink-soft/70 group-hover:text-ink-soft"
                      }`}
                    />
                    <span className="truncate">{i.label}</span>
                    {!!n && (
                      <span
                        className={`ml-auto min-w-[1.25rem] rounded-full px-1.5 py-px text-center text-[10px] font-bold tabular-nums ${
                          on ? "bg-brand-500 text-on-brand" : "bg-line text-ink-mid group-hover:bg-brand-100 group-hover:text-brand-800"
                        }`}
                      >
                        {n > 99 ? "99+" : n}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </details>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-dvh">
      {/* sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col border-r border-line bg-chrome transition-transform duration-200 lg:static lg:translate-x-0 print:hidden ${
          drawer ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        }`}
      >
        <Link href="/" className="flex items-center gap-3 border-b border-line px-5 py-4">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-base font-bold text-on-brand shadow-sm shadow-brand-600/25">
            {org.charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm leading-tight font-bold">{org}</span>
            <span className="block text-[11px] font-semibold text-ink-soft">{product}</span>
          </span>
        </Link>

        {nav}

        <div className="border-t border-line p-3">
          {sibling && (
            <a
              href={sibling.href}
              className="mb-1 flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-ink-soft transition hover:bg-canvas hover:text-ink"
            >
              <Icon name="grid" className="h-[18px] w-[18px]" />
              {sibling.label}
              <Icon name="arrow-right" className="ml-auto h-4 w-4 opacity-60" />
            </a>
          )}
          <Link
            href="/settings"
            className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition ${
              path.startsWith("/settings") ? "bg-brand-50 text-brand-700" : "text-ink-soft hover:bg-canvas hover:text-ink"
            }`}
          >
            <Icon name="gear" className="h-[18px] w-[18px]" />
            Settings
          </Link>
          <div className="mt-2 border-t border-line pt-2.5">
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {drawer && <button className="fixed inset-0 z-30 bg-scrim/60 lg:hidden" onClick={() => setDrawer(false)} aria-label="Close menu" />}

      {/* main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-chrome/85 px-4 py-3 backdrop-blur sm:px-6 print:hidden">
          <button className="rounded-lg p-2 text-ink-soft hover:bg-canvas lg:hidden" onClick={() => setDrawer(true)} aria-label="Open menu">
            <Icon name="menu" className="h-5 w-5" />
          </button>

          <form action="/search" className="relative hidden flex-1 sm:block sm:max-w-sm">
            <input
              name="q"
              placeholder={searchPlaceholder}
              className="field pl-9"
              autoComplete="off"
              aria-label="Search"
            />
            <Icon name="search" className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-ink-soft" />
          </form>

          <div className="ml-auto flex items-center gap-1.5">
            <div className="relative">
              <button
                onClick={() => setMenu(menu === "bell" ? null : "bell")}
                className="relative rounded-xl p-2 text-ink-soft hover:bg-canvas hover:text-ink"
                aria-label="Notifications"
              >
                <Icon name="bell" className="h-5 w-5" />
                {!!(counts.notifications ?? 0) && (
                  <span className="absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
                    {(counts.notifications ?? 0) > 9 ? "9+" : counts.notifications}
                  </span>
                )}
              </button>
              {menu === "bell" && (
                <>
                  <button className="fixed inset-0 z-10 cursor-default" onClick={() => setMenu(null)} tabIndex={-1} aria-hidden />
                  <div className="card absolute right-0 z-20 mt-2 w-80 overflow-hidden p-0 rise">
                    <p className="border-b border-line px-4 py-3 text-xs font-bold tracking-wide text-ink-soft uppercase">
                      Notifications
                    </p>
                    <ul className="max-h-80 divide-y divide-line overflow-y-auto">
                      {notes.length === 0 && <li className="px-4 py-6 text-center text-sm font-medium text-ink-soft">Nothing new.</li>}
                      {notes.map((n) => (
                        <li key={n.id}>
                          <Link href={n.href ?? "/notifications"} className="block px-4 py-3 hover:bg-canvas">
                            <p className="text-sm font-bold">{n.title}</p>
                            {n.body && <p className="mt-0.5 line-clamp-2 text-xs font-medium text-ink-soft">{n.body}</p>}
                            <p className="mt-1 text-[11px] font-semibold text-ink-soft/80">{timeAgo(n.created_at)}</p>
                          </Link>
                        </li>
                      ))}
                    </ul>
                    <Link href="/notifications" className="block border-t border-line px-4 py-2.5 text-center text-xs font-bold text-brand-700 hover:bg-brand-50">
                      View all
                    </Link>
                  </div>
                </>
              )}
            </div>

            <div className="relative">
              <button
                onClick={() => setMenu(menu === "user" ? null : "user")}
                className="flex items-center gap-2 rounded-xl p-1 pr-2 hover:bg-canvas"
              >
                <Avatar name={user.full_name} src={user.avatar_url} size="md" />
                <span className="hidden text-left sm:block">
                  <span className="block max-w-32 truncate text-xs leading-tight font-bold">{user.full_name}</span>
                  <span className="block max-w-32 truncate text-[11px] font-semibold text-ink-soft">
                    {user.job_title ?? user.role}
                  </span>
                </span>
              </button>
              {menu === "user" && (
                <>
                  <button className="fixed inset-0 z-10 cursor-default" onClick={() => setMenu(null)} tabIndex={-1} aria-hidden />
                  <div className="card absolute right-0 z-20 mt-2 w-56 overflow-hidden p-0 rise">
                    <div className="border-b border-line px-4 py-3">
                      <p className="truncate text-sm font-bold">{user.full_name}</p>
                      <p className="truncate text-xs font-medium text-ink-soft">{user.email}</p>
                    </div>
                    <Link href="/settings" className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold hover:bg-canvas">
                      <Icon name="gear" className="h-4 w-4 text-ink-soft" /> My profile
                    </Link>
                    <Link href="/settings/security" className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold hover:bg-canvas">
                      <Icon name="shield" className="h-4 w-4 text-ink-soft" /> Security
                    </Link>
                    <Link href="/settings/signature" className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold hover:bg-canvas">
                      <Icon name="pen" className="h-4 w-4 text-ink-soft" /> My signature
                    </Link>
                    <form action={logout} className="border-t border-line">
                      <button type="submit" className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50">
                        <Icon name="logout" className="h-4 w-4" /> Sign out
                      </button>
                    </form>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:py-8 print:max-w-none print:p-0">{children}</main>
      </div>
    </div>
  );
}

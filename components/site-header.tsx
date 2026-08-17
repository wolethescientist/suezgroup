"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Wordmark } from "./logo";

const NAV = [
  { href: "/companies", label: "Companies" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="fixed inset-x-3 top-3 z-50 sm:inset-x-5 sm:top-5">
      <div className="site-nav mx-auto flex w-full max-w-[86rem] items-center justify-between rounded-full border border-slate-line bg-slate/90 pl-4 pr-2 shadow-[0_16px_50px_rgb(23_37_40_/_0.08)] backdrop-blur-xl sm:pl-6">
        <Wordmark />

        <nav aria-label="Main" className="hidden items-center gap-8 lg:flex">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`link-slide text-[0.68rem] font-semibold uppercase tracking-[0.1em] transition-colors duration-200 ${
                  active ? "text-ember-ink" : "text-fg-slate-muted hover:text-fg-slate"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/companies" className="btn btn-ember hidden sm:inline-flex">
            Explore the group
          </Link>

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className="grid h-11 w-11 cursor-pointer place-items-center rounded-full border border-slate-line transition-colors duration-200 hover:bg-slate-2 lg:hidden"
          >
            <span className="relative block h-3 w-4">
              <span className={`absolute left-0 h-px w-full bg-fg-slate transition-transform duration-300 ${open ? "top-1.5 rotate-45" : "top-0"}`} />
              <span className={`absolute left-0 h-px w-full bg-fg-slate transition-transform duration-300 ${open ? "top-1.5 -rotate-45" : "top-3"}`} />
            </span>
          </button>
        </div>
      </div>

      <div className={`overflow-hidden rounded-3xl border-slate-line bg-slate/95 shadow-[0_18px_50px_rgb(23_37_40_/_0.1)] backdrop-blur-xl transition-[max-height,opacity,margin] duration-500 lg:hidden ${open ? "mt-2 max-h-[26rem] border opacity-100" : "mt-0 max-h-0 border-0 opacity-0"}`}>
        <nav aria-label="Mobile" className="mx-auto flex w-full max-w-[86rem] flex-col px-4 py-4 sm:px-6">
          {NAV.map((item, index) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-baseline justify-between border-b border-slate-line py-4 font-display text-2xl transition-colors duration-200 last:border-0 hover:text-ember-ink"
            >
              {item.label}
              <span className="font-sans text-[0.68rem] text-fg-slate-muted">0{index + 1}</span>
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

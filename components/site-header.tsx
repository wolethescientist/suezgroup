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
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="fixed inset-x-3 top-12 z-50 sm:inset-x-5 sm:top-14">
      <div
        className={`mx-auto flex w-full max-w-[84rem] items-center justify-between rounded-full border pl-5 pr-2 transition-[background-color,border-color,padding] duration-500 sm:pl-7 sm:pr-2.5 ${
          scrolled
            ? "border-slate-line bg-slate/85 py-2 backdrop-blur-xl"
            : "border-transparent bg-transparent py-3.5"
        }`}
      >
        <Wordmark />

        <nav aria-label="Main" className="hidden items-center gap-9 lg:flex">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`link-slide text-[0.6875rem] font-medium uppercase tracking-[0.09em] transition-colors duration-200 ${
                  active ? "text-ember" : "text-fg-slate-muted hover:text-fg-slate"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* The group's job is to route you to an operating company */}
          <Link href="/companies" className="btn btn-ember hidden sm:inline-flex">
            Our companies
          </Link>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className="grid h-11 w-11 cursor-pointer place-items-center rounded-full border border-slate-line transition-colors duration-200 hover:bg-slate-2 lg:hidden"
          >
            <span className="relative block h-3 w-4">
              <span
                className={`absolute left-0 h-px w-full bg-fg-slate transition-all duration-300 ${
                  open ? "top-1.5 rotate-45" : "top-0"
                }`}
              />
              <span
                className={`absolute left-0 h-px w-full bg-fg-slate transition-all duration-300 ${
                  open ? "top-1.5 -rotate-45" : "top-3"
                }`}
              />
            </span>
          </button>
        </div>
      </div>

      <div
        className={`overflow-hidden rounded-3xl border-slate-line bg-slate/95 backdrop-blur-xl transition-[max-height,opacity,margin] duration-500 lg:hidden ${
          open ? "mt-2 max-h-[26rem] border opacity-100" : "mt-0 max-h-0 border-0 opacity-0"
        }`}
      >
        <nav
          aria-label="Mobile"
          className="mx-auto flex w-full max-w-[84rem] flex-col px-4 py-4 sm:px-6"
        >
          {NAV.map((item, i) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-baseline justify-between border-b border-slate-line py-4 font-display text-2xl transition-colors duration-200 last:border-0 hover:text-ember"
            >
              {item.label}
              <span className="text-[0.6875rem] text-fg-slate-muted">
                {String(i + 1).padStart(2, "0")}
              </span>
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

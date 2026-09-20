"use client";

import { useEffect, useState } from "react";
import { ActionForm, SubmitBtn, type Action } from "@/components/form";
import { Icon } from "@/components/icons";

/**
 * The clock.
 *
 * The elapsed counter ticks on the client because a server-rendered "3h 12m"
 * is wrong the moment it is painted, and the point of the card is to be glanced
 * at. Nothing is decided here: the server writes `now()`, so a fiddled clock on
 * the employee's laptop changes what this displays and not what is recorded.
 */
export function ClockCard({
  openSince,
  clockInAction,
  clockOutAction,
}: {
  openSince: string | null;
  clockInAction: Action;
  clockOutAction: Action;
}) {
  const [now, setNow] = useState<number | null>(null);

  // Starts only after mount, so the server and the first client render agree.
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const since = openSince ? new Date(openSince).getTime() : null;
  const elapsed = since && now ? Math.max(0, Math.floor((now - since) / 1000)) : null;

  return (
    <div className={`card p-5 ${openSince ? "ring-1 ring-emerald-200 ring-inset" : ""}`}>
      <p className="text-[11px] font-bold tracking-wide text-ink-soft uppercase">
        {openSince ? "Clocked in" : "Not clocked in"}
      </p>

      <p className="mt-2 flex items-baseline gap-2 font-bold tabular-nums">
        <span className={`text-3xl ${openSince ? "text-emerald-700" : "text-ink-soft"}`}>
          {elapsed == null ? "—" : clock(elapsed)}
        </span>
        {openSince && <span className="text-xs font-bold text-ink-soft">since {timeOf(openSince)}</span>}
      </p>

      <p className="mt-1 mb-4 text-sm font-medium text-ink-soft">
        {openSince
          ? "Remember to clock out before you leave."
          : "Your arrival time is recorded when you tap below."}
      </p>

      <ActionForm action={openSince ? clockOutAction : clockInAction} className="grid gap-2">
        <input
          name="note"
          placeholder={openSince ? "Anything to note about today? (optional)" : "Working from home, site visit… (optional)"}
          className="field"
          maxLength={140}
        />
        <SubmitBtn variant={openSince ? "outline" : "primary"}>
          <Icon name="clock" className="h-4 w-4" />
          {openSince ? "Clock out" : "Clock in"}
        </SubmitBtn>
      </ActionForm>
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

function clock(seconds: number) {
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
}

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

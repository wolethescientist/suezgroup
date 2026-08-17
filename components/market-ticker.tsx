"use client";

import { useEffect, useState } from "react";

const SIGNALS = [
  { label: "LPG REFILL", value: "3–50 KG", delta: "DOORSTEP", tone: "up" },
  { label: "POWER TOKENS", value: "< 60 SEC", delta: "ONLINE", tone: "up" },
  { label: "AGENT KIOSKS", value: "11 DNOs", delta: "REACH", tone: "up" },
  { label: "BULK HAULAGE", value: "BY VOLUME", delta: "UPSTREAM", tone: "steady" },
  { label: "ABUJA ROUTE", value: "14 YEARS", delta: "RUNNING", tone: "up" },
];

function Signal({
  label,
  value,
  delta,
  tone,
}: (typeof SIGNALS)[number]) {
  return (
    <span className="market-ticker-item">
      <span className="market-ticker-label">{label}</span>
      <strong>{value}</strong>
      <span className={`market-ticker-delta market-ticker-delta-${tone}`}>
        {tone === "up" ? "▲" : "•"} {delta}
      </span>
    </span>
  );
}

export function MarketTicker() {
  const [time, setTime] = useState("NOW");

  useEffect(() => {
    const update = () =>
      setTime(
        new Intl.DateTimeFormat("en-NG", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(new Date()),
      );
    update();
    const interval = window.setInterval(update, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <aside className="market-ticker" aria-label="Suez operating pulse">
      <div className="market-ticker-status">
        <span className="market-ticker-dot" aria-hidden="true" />
        <span>Live pulse</span>
        <span className="market-ticker-time">{time}</span>
      </div>
      <div className="market-ticker-window">
        <div className="market-ticker-loop">
          <div className="market-ticker-set">
            {SIGNALS.map((signal) => (
              <Signal key={signal.label} {...signal} />
            ))}
          </div>
          <div className="market-ticker-set" aria-hidden="true">
            {SIGNALS.map((signal) => (
              <Signal key={`${signal.label}-repeat`} {...signal} />
            ))}
          </div>
        </div>
      </div>
      <span className="market-ticker-note">Operational signals · Abuja / Nigeria</span>
    </aside>
  );
}

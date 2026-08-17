"use client";

import { useEffect, useState } from "react";

type Quote = {
  symbol: string;
  name: string;
  sector: string;
  currency: string;
  price: number;
  change: number;
  changePercent: number;
};

function formatPrice(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function MarketRibbon() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    fetch("/api/market")
      .then((response) => {
        if (!response.ok) throw new Error("Market feed unavailable");
        return response.json() as Promise<{ quotes: Quote[] }>;
      })
      .then((data) => {
        if (!active) return;
        setQuotes(data.quotes);
        setStatus(data.quotes.length ? "ready" : "error");
      })
      .catch(() => {
        if (active) setStatus("error");
      });

    return () => { active = false; };
  }, []);

  const items = quotes.length ? [...quotes, ...quotes] : [];

  return (
    <aside className="market-ribbon" aria-label="Energy, gas and technology market watch" aria-live="polite">
      <div className="market-ribbon-label">
        <span className="market-ribbon-dot" aria-hidden="true" />
        <strong>Market watch</strong>
        <span className="market-ribbon-time">{status === "loading" ? "Loading" : status === "error" ? "Unavailable" : "Delayed"}</span>
      </div>
      <div className="market-ribbon-window">
        {items.length ? (
          <div className="market-ribbon-loop">
            {items.map((quote, index) => {
              const positive = quote.change >= 0;
              return (
                <span className="market-ribbon-item" key={`${quote.symbol}-${index}`} aria-hidden={index >= quotes.length}>
                  <small>{quote.sector}</small>
                  <strong>{quote.symbol}</strong>
                  <span>{formatPrice(quote.price, quote.currency)}</span>
                  <b className={positive ? "is-up" : "is-down"}>{positive ? "▲" : "▼"} {Math.abs(quote.changePercent).toFixed(2)}%</b>
                </span>
              );
            })}
          </div>
        ) : (
          <span className="market-ribbon-empty">Market prices are loading from the public feed</span>
        )}
      </div>
      <a className="market-ribbon-source" href="https://finance.yahoo.com/" target="_blank" rel="noopener noreferrer">Yahoo Finance · delayed data ↗</a>
    </aside>
  );
}

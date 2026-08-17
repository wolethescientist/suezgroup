import { NextResponse } from "next/server";

export const revalidate = 300;

const WATCHLIST = [
  { symbol: "XOM", name: "ExxonMobil", sector: "Energy" },
  { symbol: "SHEL", name: "Shell", sector: "Energy" },
  { symbol: "OXY", name: "Occidental", sector: "Gas" },
  { symbol: "MSFT", name: "Microsoft", sector: "Software" },
  { symbol: "NVDA", name: "NVIDIA", sector: "ICT" },
  { symbol: "ORCL", name: "Oracle", sector: "Technology" },
] as const;

type YahooChart = {
  chart?: {
    result?: Array<{
      meta?: {
        currency?: string;
        regularMarketPrice?: number;
        chartPreviousClose?: number;
      };
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
  };
};

async function readQuote(item: (typeof WATCHLIST)[number]) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(item.symbol)}?range=5d&interval=1d`;
  const response = await fetch(url, {
    headers: { "User-Agent": "SuezGroup/1.0 market ribbon" },
    next: { revalidate: 300 },
  });

  if (!response.ok) throw new Error(`Market request failed for ${item.symbol}`);

  const data = (await response.json()) as YahooChart;
  const result = data.chart?.result?.[0];
  const meta = result?.meta;
  const closes = result?.indicators?.quote?.[0]?.close?.filter(
    (value): value is number => typeof value === "number",
  ) ?? [];
  const price = meta?.regularMarketPrice ?? closes.at(-1);
  const previous = meta?.chartPreviousClose ?? closes.at(-2);

  if (typeof price !== "number" || typeof previous !== "number") {
    throw new Error(`Market data incomplete for ${item.symbol}`);
  }

  const change = price - previous;
  return {
    ...item,
    currency: meta?.currency ?? "USD",
    price,
    change,
    changePercent: (change / previous) * 100,
  };
}

export async function GET() {
  const settled = await Promise.allSettled(WATCHLIST.map(readQuote));
  const quotes = settled.flatMap((entry) => (entry.status === "fulfilled" ? [entry.value] : []));

  return NextResponse.json(
    {
      quotes,
      fetchedAt: new Date().toISOString(),
      source: "Yahoo Finance chart data",
      delayed: true,
    },
    { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=600" } },
  );
}

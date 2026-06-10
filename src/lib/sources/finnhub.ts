import { stableHash } from "@/lib/sources/hash";
import type { SourceCollectionResult, SourceItemInput } from "@/lib/sources/types";

type FinnhubEarnings = {
  date?: string;
  epsActual?: number | null;
  epsEstimate?: number | null;
  hour?: string;
  quarter?: number;
  revenueActual?: number | null;
  revenueEstimate?: number | null;
  symbol: string;
  year?: number;
};

export async function collectFinnhubEarnings(symbols: string[], daysAhead = 30): Promise<SourceCollectionResult> {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) {
    return { items: [], warnings: ["FINNHUB_API_KEY not configured; skipped earnings calendar."] };
  }

  const from = toDate(new Date());
  const to = toDate(new Date(Date.now() + daysAhead * 24 * 60 * 60_000));
  const items: SourceItemInput[] = [];
  const warnings: string[] = [];

  for (const symbol of symbols) {
    const params = new URLSearchParams({ from, to, symbol, token });
    try {
      const response = await fetch(`https://finnhub.io/api/v1/calendar/earnings?${params.toString()}`, {
        next: { revalidate: 3600 }
      });
      if (!response.ok) throw new Error(`Finnhub ${response.status}`);
      const payload = (await response.json()) as { earningsCalendar?: FinnhubEarnings[] };
      for (const event of payload.earningsCalendar ?? []) {
        if (!event.date) continue;
        items.push({
          sourceType: "finnhub",
          sourceName: "Finnhub Earnings Calendar",
          externalId: `${event.symbol}:${event.date}:${event.quarter ?? ""}`,
          title: `${event.symbol} earnings expected ${event.date}`,
          url: `https://finnhub.io/`,
          publishedAt: new Date(`${event.date}T12:00:00Z`),
          contentHash: stableHash(["finnhub", event.symbol, event.date, String(event.quarter ?? "")]),
          summary: `${event.symbol} earnings release is expected on ${event.date}${event.hour ? ` (${event.hour})` : ""}.`,
          rawJson: event as unknown as Record<string, unknown>
        });
      }
    } catch (error) {
      warnings.push(`Finnhub earnings failed for ${symbol}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  return { items, warnings };
}

function toDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

import type { WatchlistItem } from "@/db/repository";
import { collectBlsLatestIndicators } from "@/lib/sources/bls";
import { collectFmpEconomicCalendar, collectTradingEconomicsCalendar } from "@/lib/sources/economicCalendar";
import { collectFinnhubCompanyNews, collectFinnhubEarnings } from "@/lib/sources/finnhub";
import { collectFredMacroIntelligence, collectFredReleaseItems } from "@/lib/sources/fred";
import { collectMacroRssItems } from "@/lib/sources/rss";
import { collectSecFilings } from "@/lib/sources/sec";
import type { EconomicCalendarEventInput, SourceCollectionResult, SourceCollectorStat, SourceItemInput } from "@/lib/sources/types";

export async function collectAllSources(watchlist: WatchlistItem[]): Promise<SourceCollectionResult> {
  const symbols = watchlist.map((item) => item.symbol);
  const results = await Promise.all([
    collectMacroRssItems(),
    collectTradingEconomicsCalendar(),
    collectFmpEconomicCalendar(),
    collectBlsLatestIndicators(),
    collectFredReleaseItems(),
    collectFredMacroIntelligence(),
    collectSecFilings(symbols),
    collectFinnhubEarnings(symbols),
    collectFinnhubCompanyNews(symbols)
  ]);

  const byHash = new Map<string, SourceItemInput>();
  const calendarByKey = new Map<string, EconomicCalendarEventInput>();
  const stats = new Map<string, SourceCollectorStat>();
  for (const result of results) {
    for (const item of result.items) {
      byHash.set(item.contentHash, item);
      const key = `${item.sourceType}:${item.sourceName}`;
      const existing = stats.get(key);
      stats.set(key, {
        sourceType: item.sourceType,
        sourceName: item.sourceName,
        itemCount: (existing?.itemCount ?? 0) + 1
      });
    }
    for (const event of result.calendarEvents ?? []) {
      calendarByKey.set(`${event.provider}:${event.externalId}`, event);
      const key = `${event.provider}:calendar`;
      const existing = stats.get(key);
      stats.set(key, {
        sourceType: event.provider,
        sourceName: `${event.provider} calendar`,
        itemCount: existing?.itemCount ?? 0,
        calendarEventCount: (existing?.calendarEventCount ?? 0) + 1
      });
    }
  }

  return {
    items: Array.from(byHash.values()),
    calendarEvents: Array.from(calendarByKey.values()),
    warnings: results.flatMap((result) => result.warnings),
    stats: Array.from(stats.values()).sort(
      (left, right) =>
        right.itemCount + (right.calendarEventCount ?? 0) - (left.itemCount + (left.calendarEventCount ?? 0))
    )
  };
}

import type { WatchlistItem } from "@/db/repository";
import { collectFinnhubCompanyNews, collectFinnhubEarnings } from "@/lib/sources/finnhub";
import { collectFredMacroIntelligence, collectFredReleaseItems } from "@/lib/sources/fred";
import { collectMacroRssItems } from "@/lib/sources/rss";
import { collectSecFilings } from "@/lib/sources/sec";
import type { SourceCollectionResult, SourceCollectorStat } from "@/lib/sources/types";

export async function collectAllSources(watchlist: WatchlistItem[]): Promise<SourceCollectionResult> {
  const symbols = watchlist.map((item) => item.symbol);
  const results = await Promise.all([
    collectMacroRssItems(),
    collectFredReleaseItems(),
    collectFredMacroIntelligence(),
    collectSecFilings(symbols),
    collectFinnhubEarnings(symbols),
    collectFinnhubCompanyNews(symbols)
  ]);

  const byHash = new Map();
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
  }

  return {
    items: Array.from(byHash.values()),
    warnings: results.flatMap((result) => result.warnings),
    stats: Array.from(stats.values()).sort((left, right) => right.itemCount - left.itemCount)
  };
}

import type { WatchlistItem } from "@/db/repository";
import { collectFinnhubEarnings } from "@/lib/sources/finnhub";
import { collectFredReleaseItems } from "@/lib/sources/fred";
import { collectMacroRssItems } from "@/lib/sources/rss";
import { collectSecFilings } from "@/lib/sources/sec";
import type { SourceCollectionResult } from "@/lib/sources/types";

export async function collectAllSources(watchlist: WatchlistItem[]): Promise<SourceCollectionResult> {
  const symbols = watchlist.map((item) => item.symbol);
  const results = await Promise.all([
    collectMacroRssItems(),
    collectFredReleaseItems(),
    collectSecFilings(symbols),
    collectFinnhubEarnings(symbols)
  ]);

  const byHash = new Map();
  for (const result of results) {
    for (const item of result.items) {
      byHash.set(item.contentHash, item);
    }
  }

  return {
    items: Array.from(byHash.values()),
    warnings: results.flatMap((result) => result.warnings)
  };
}

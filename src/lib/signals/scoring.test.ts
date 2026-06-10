import { describe, expect, it } from "vitest";

import type { WatchlistItem } from "@/db/repository";
import { calculateSignalScore, fallbackSignalsFromSources } from "@/lib/signals/scoring";
import type { SourceItemInput } from "@/lib/sources/types";

const watchlist = [
  {
    id: "1",
    symbol: "NVDA",
    name: "Nvidia",
    assetType: "stock_etf",
    sector: "Semiconductors",
    portfolioWeight: 0.28,
    notes: null,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    id: "2",
    symbol: "SPY",
    name: "S&P 500 ETF",
    assetType: "stock_etf",
    sector: "Index",
    portfolioWeight: 0.15,
    notes: null,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date()
  }
] satisfies WatchlistItem[];

describe("calculateSignalScore", () => {
  it("weights portfolio relevance and days-to-weeks proximity", () => {
    const result = calculateSignalScore(
      {
        eventDate: new Date(Date.now() + 3 * 24 * 60 * 60_000).toISOString(),
        affectedSymbols: [{ symbol: "NVDA", relevance: 94, rationale: "Direct holding" }],
        breakdown: {
          portfolioRelevance: 50,
          timeProximity: 50,
          magnitudeSurprise: 82,
          sourceCredibility: 88,
          marketBreadth: 72,
          modelConfidence: 84
        }
      },
      watchlist
    );

    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.rankingLabel).toBe("high");
    expect(result.breakdown.portfolioRelevance).toBeGreaterThan(90);
  });
});

describe("fallbackSignalsFromSources", () => {
  it("creates portfolio-specific fallback candidates from source text", () => {
    const sources: SourceItemInput[] = [
      {
        sourceType: "sec",
        sourceName: "SEC EDGAR",
        externalId: "abc",
        title: "NVDA: 10-Q filed by Nvidia",
        url: "https://sec.gov/example",
        publishedAt: new Date(),
        contentHash: "hash",
        summary: "NVDA filed a quarterly report.",
        rawJson: {}
      }
    ];

    const [candidate] = fallbackSignalsFromSources(sources, watchlist);

    expect(candidate.eventType).toBe("filing");
    expect(candidate.affectedSymbols[0]?.symbol).toBe("NVDA");
    expect(candidate.citations[0]?.source).toBe("SEC EDGAR");
  });
});

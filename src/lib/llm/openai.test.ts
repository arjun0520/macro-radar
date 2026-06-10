import { describe, expect, it } from "vitest";

import type { WatchlistItem } from "@/db/repository";
import { toSignalRecords } from "@/lib/llm/openai";
import type { RawSignalCandidate } from "@/lib/signals/scoring";

const watchlist = [
  {
    id: "1",
    symbol: "AAPL",
    name: "Apple",
    assetType: "stock_etf",
    sector: "Technology",
    portfolioWeight: null,
    notes: null,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date()
  }
] satisfies WatchlistItem[];

describe("toSignalRecords", () => {
  it("normalizes LLM candidates into persisted signal records", () => {
    const candidates: RawSignalCandidate[] = [
      {
        sourceItemContentHash: "source-hash",
        eventType: "earnings",
        title: "AAPL earnings expected next week",
        summary: "Apple reports earnings next week with iPhone demand in focus.",
        eventDate: new Date(Date.now() + 5 * 24 * 60 * 60_000).toISOString(),
        citations: [{ title: "AAPL earnings", url: "https://example.com", source: "Example" }],
        affectedSymbols: [{ symbol: "AAPL", relevance: 90, rationale: "Direct holding" }],
        directionalSuggestion: "Review exposure before the print; wait for guidance confirmation.",
        reason: "Direct watchlist earnings catalyst within one week.",
        breakdown: {
          portfolioRelevance: 90,
          timeProximity: 85,
          magnitudeSurprise: 70,
          sourceCredibility: 80,
          marketBreadth: 45,
          modelConfidence: 78
        }
      }
    ];

    const [record] = toSignalRecords(candidates, watchlist);

    expect(record.event.fingerprint).toHaveLength(64);
    expect(record.event.sourceItemContentHash).toBe("source-hash");
    expect(record.score.score).toBeGreaterThan(70);
    expect(record.score.directionalSuggestion).toContain("Review exposure");
  });
});

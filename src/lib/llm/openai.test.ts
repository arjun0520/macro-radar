import { afterEach, describe, expect, it, vi } from "vitest";

import type { WatchlistItem } from "@/db/repository";
import { extractAndScoreSignals, toSignalRecords } from "@/lib/llm/openai";
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

const originalOpenAiKey = process.env.OPENAI_API_KEY;
const originalFetch = global.fetch;

afterEach(() => {
  process.env.OPENAI_API_KEY = originalOpenAiKey;
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

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

describe("extractAndScoreSignals", () => {
  it("keeps the top 20 signals when the LLM returns too many", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const rankedSignals = Array.from({ length: 25 }, (_, index): RawSignalCandidate => ({
      sourceItemContentHash: "source-hash",
      eventType: "macro_release",
      title: `Macro event ${index}`,
      summary: "High-impact macro event.",
      eventDate: new Date(Date.now() + index * 60_000).toISOString(),
      citations: [{ title: "Source", url: "https://example.com", source: "Example" }],
      affectedSymbols: [{ symbol: "AAPL", relevance: 80 + (index % 10), rationale: "Watchlist exposure." }],
      directionalSuggestion: "Prepare for volatility; wait for confirmation before changing exposure.",
      reason: "Evidence-backed macro event with watchlist relevance.",
      breakdown: {
        portfolioRelevance: 80 + (index % 10),
        timeProximity: 90,
        magnitudeSurprise: 80,
        sourceCredibility: 85,
        marketBreadth: 80,
        modelConfidence: 82
      }
    }));

    let callCount = 0;
    global.fetch = vi.fn(async () => {
      callCount += 1;
      const payload =
        callCount === 1
          ? {
              candidates: [
                {
                  ...rankedSignals[0],
                  breakdown: undefined,
                  evidenceLevel: "strong",
                  marketMechanism: "Rates affect equity multiples.",
                  whyNow: "Event is near term."
                }
              ]
            }
          : { signals: rankedSignals };

      return new Response(JSON.stringify({ output_text: JSON.stringify(payload) }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }) as typeof fetch;

    const result = await extractAndScoreSignals(
      [
        {
          sourceType: "fmp",
          sourceName: "FMP Economic Calendar",
          externalId: "event",
          title: "Macro event",
          url: "https://example.com",
          publishedAt: new Date(),
          contentHash: "source-hash",
          summary: "Macro calendar event.",
          rawJson: {}
        }
      ],
      watchlist
    );

    expect(result.usedFallback).toBe(false);
    expect(result.records).toHaveLength(20);
    expect(result.warnings[0]).toContain("kept top 20");
  });
});

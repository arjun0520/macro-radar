import { afterEach, describe, expect, it, vi } from "vitest";

import type { WatchlistItem } from "@/db/repository";
import { extractAndScoreSignals, sanitizeEnvValue, toSignalRecords } from "@/lib/llm/openai";
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
const originalOpenAiModel = process.env.OPENAI_MODEL;
const originalExtractionModel = process.env.OPENAI_EXTRACTION_MODEL;
const originalRankingModel = process.env.OPENAI_RANKING_MODEL;
const originalFetch = global.fetch;

afterEach(() => {
  restoreEnv("OPENAI_API_KEY", originalOpenAiKey);
  restoreEnv("OPENAI_MODEL", originalOpenAiModel);
  restoreEnv("OPENAI_EXTRACTION_MODEL", originalExtractionModel);
  restoreEnv("OPENAI_RANKING_MODEL", originalRankingModel);
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function restoreEnv(name: string, value: string | undefined) {
  if (value == null) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

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
  it("strips accidental wrapping quotes from env values", () => {
    expect(sanitizeEnvValue('"gpt-5.4-mini"')).toBe("gpt-5.4-mini");
    expect(sanitizeEnvValue("'gpt-5.4-mini'")).toBe("gpt-5.4-mini");
    expect(sanitizeEnvValue("undefined")).toBeUndefined();
  });

  it("keeps the top 20 signals when the LLM returns too many", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_MODEL = '"gpt-5.4-mini"';
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
    const seenModels: unknown[] = [];
    global.fetch = vi.fn(async (_url, init) => {
      seenModels.push(JSON.parse(String(init?.body)).model);
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
        headers: { "Content-Type": "application/json" },
        statusText: "OK"
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
    expect(seenModels).toEqual(["gpt-5.4-mini", "gpt-5.4-mini"]);
    expect(result.diagnostics.modelSanitized).toBe(true);
    expect(result.records).toHaveLength(20);
    expect(result.warnings[0]).toContain("kept top 20");
  });

  it("uses stage-specific models and aggregates token usage", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_MODEL = "gpt-5.4-mini";
    process.env.OPENAI_EXTRACTION_MODEL = "gpt-5.4-mini";
    process.env.OPENAI_RANKING_MODEL = "gpt-5.4-mini";
    const seenModels: unknown[] = [];
    let callCount = 0;
    global.fetch = vi.fn(async (_url, init) => {
      seenModels.push(JSON.parse(String(init?.body)).model);
      callCount += 1;
      const payload =
        callCount === 1
          ? {
              candidates: [
                {
                  sourceItemContentHash: "source-hash",
                  eventType: "macro_release",
                  title: "Macro event",
                  summary: "High-impact macro event.",
                  eventDate: new Date().toISOString(),
                  citations: [{ title: "Source", url: "https://example.com", source: "Example" }],
                  affectedSymbols: [{ symbol: "AAPL", relevance: 80, rationale: "Watchlist exposure." }],
                  directionalSuggestion: "Prepare for volatility; wait for confirmation.",
                  reason: "Evidence-backed macro event.",
                  evidenceLevel: "strong",
                  marketMechanism: "Rates affect equity multiples.",
                  whyNow: "Event is near term."
                }
              ]
            }
          : {
              signals: [
                {
                  sourceItemContentHash: "source-hash",
                  eventType: "macro_release",
                  title: "Macro event",
                  summary: "High-impact macro event.",
                  eventDate: new Date().toISOString(),
                  citations: [{ title: "Source", url: "https://example.com", source: "Example" }],
                  affectedSymbols: [{ symbol: "AAPL", relevance: 80, rationale: "Watchlist exposure." }],
                  directionalSuggestion: "Prepare for volatility; wait for confirmation.",
                  reason: "Evidence-backed macro event.",
                  breakdown: {
                    portfolioRelevance: 80,
                    timeProximity: 90,
                    magnitudeSurprise: 80,
                    sourceCredibility: 85,
                    marketBreadth: 80,
                    modelConfidence: 82
                  }
                }
              ]
            };

      return new Response(
        JSON.stringify({
          output_text: JSON.stringify(payload),
          usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
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

    expect(seenModels).toEqual(["gpt-5.4-mini", "gpt-5.4-mini"]);
    expect(result.diagnostics.extractionModel).toBe("gpt-5.4-mini");
    expect(result.diagnostics.rankingModel).toBe("gpt-5.4-mini");
    expect(result.diagnostics.tokenUsage?.totalTokens).toBe(240);
    expect(result.diagnostics.phases[0].tokenUsage?.inputTokens).toBe(100);
  });
});

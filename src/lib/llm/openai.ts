import { createHash } from "node:crypto";
import { z } from "zod";

import type { SignalRecordInput, WatchlistItem } from "@/db/repository";
import {
  calculateSignalScore,
  fallbackSignalsFromSources,
  type RawSignalCandidate
} from "@/lib/signals/scoring";
import type { SourceItemInput } from "@/lib/sources/types";

const candidateSchema = z.object({
  sourceItemContentHash: z.string().nullable().optional(),
  eventType: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  eventDate: z.string().nullable().optional(),
  citations: z
    .array(
      z.object({
        title: z.string(),
        url: z.string(),
        source: z.string(),
        publishedAt: z.string().optional()
      })
    )
    .default([]),
  affectedSymbols: z
    .array(
      z.object({
        symbol: z.string(),
        relevance: z.number().min(0).max(100),
        rationale: z.string()
      })
    )
    .default([]),
  directionalSuggestion: z.string().min(1),
  reason: z.string().min(1),
  breakdown: z.object({
    portfolioRelevance: z.number().min(0).max(100),
    timeProximity: z.number().min(0).max(100),
    magnitudeSurprise: z.number().min(0).max(100),
    sourceCredibility: z.number().min(0).max(100),
    marketBreadth: z.number().min(0).max(100),
    modelConfidence: z.number().min(0).max(100)
  })
});

const responseSchema = z.object({
  signals: z.array(candidateSchema).max(20)
});

export async function extractAndScoreSignals(
  sourceItems: SourceItemInput[],
  watchlist: WatchlistItem[]
): Promise<{ records: SignalRecordInput[]; usedFallback: boolean; warnings: string[] }> {
  if (sourceItems.length === 0) {
    return { records: [], usedFallback: false, warnings: [] };
  }

  const candidates = process.env.OPENAI_API_KEY
    ? await callOpenAi(sourceItems, watchlist)
    : {
        signals: fallbackSignalsFromSources(sourceItems, watchlist),
        warning: "OPENAI_API_KEY not configured; used deterministic source fallback."
      };

  const parsed = responseSchema.safeParse({ signals: candidates.signals });
  if (!parsed.success) {
    const fallback = fallbackSignalsFromSources(sourceItems, watchlist);
    return {
      records: toSignalRecords(fallback, watchlist),
      usedFallback: true,
      warnings: [`LLM output failed validation; used fallback. ${parsed.error.message}`]
    };
  }

  return {
    records: toSignalRecords(parsed.data.signals, watchlist),
    usedFallback: Boolean(candidates.warning),
    warnings: candidates.warning ? [candidates.warning] : []
  };
}

export function toSignalRecords(candidates: RawSignalCandidate[], watchlist: WatchlistItem[]): SignalRecordInput[] {
  return candidates.map((candidate) => {
    const scored = calculateSignalScore(candidate, watchlist);
    return {
      event: {
        fingerprint: fingerprint(candidate),
        sourceItemContentHash: candidate.sourceItemContentHash ?? null,
        eventType: candidate.eventType,
        title: candidate.title,
        summary: candidate.summary,
        eventDate: parseEventDate(candidate.eventDate),
        impactHorizon: "days_to_weeks",
        citations: candidate.citations,
        rawModelJson: candidate as unknown as Record<string, unknown>
      },
      score: {
        score: scored.score,
        rankingLabel: scored.rankingLabel,
        reason: candidate.reason,
        directionalSuggestion: candidate.directionalSuggestion,
        breakdown: scored.breakdown,
        affectedSymbols: candidate.affectedSymbols
      }
    };
  });
}

async function callOpenAi(
  sourceItems: SourceItemInput[],
  watchlist: WatchlistItem[]
): Promise<{ signals: RawSignalCandidate[]; warning?: string }> {
  const payload = {
    model: process.env.OPENAI_MODEL ?? "gpt-5.5",
    reasoning: { effort: "low" },
    tools: [
      {
        type: "web_search",
        search_context_size: "low"
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "macro_radar_signals",
        strict: true,
        schema: structuredOutputSchema
      }
    },
    input: [
      {
        role: "system",
        content:
          "You are Macro Radar, a high-precision financial event analyst. Return only cited, decision-support events. Do not recommend exact trades or claim certainty. Prefer fewer, higher-signal events."
      },
      {
        role: "user",
        content: JSON.stringify({
          horizon: "days_to_weeks",
          portfolio: watchlist.map((item) => ({
            symbol: item.symbol,
            name: item.name,
            sector: item.sector,
            portfolioWeight: item.portfolioWeight
          })),
          sourceItems: sourceItems.slice(0, 80).map((item) => ({
            sourceItemContentHash: item.contentHash,
            sourceType: item.sourceType,
            sourceName: item.sourceName,
            title: item.title,
            url: item.url,
            publishedAt: item.publishedAt?.toISOString(),
            summary: item.summary,
            rawJson: item.rawJson
          })),
          scoringGuidance: {
            portfolioRelevance: "Direct holding or high sector/index exposure.",
            timeProximity: "Higher for events within 1-21 days.",
            magnitudeSurprise: "Potential surprise versus expectations or material market impact.",
            sourceCredibility: "Official APIs and primary filings are highest.",
            marketBreadth: "Higher when event can move rates, inflation, risk appetite, or broad indexes.",
            modelConfidence: "Evidence quality and specificity."
          }
        })
      }
    ]
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    return {
      signals: fallbackSignalsFromSources(sourceItems, watchlist),
      warning: `OpenAI request failed (${response.status}); used deterministic source fallback.`
    };
  }

  const data = (await response.json()) as { output_text?: string; output?: unknown };
  const text = data.output_text ?? extractOutputText(data.output);
  if (!text) {
    return {
      signals: fallbackSignalsFromSources(sourceItems, watchlist),
      warning: "OpenAI response had no output_text; used deterministic source fallback."
    };
  }

  try {
    return responseSchema.parse(JSON.parse(text));
  } catch (error) {
    return {
      signals: fallbackSignalsFromSources(sourceItems, watchlist),
      warning: `OpenAI JSON parse failed; used deterministic source fallback. ${error instanceof Error ? error.message : ""}`
    };
  }
}

function parseEventDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function fingerprint(candidate: RawSignalCandidate): string {
  return createHash("sha256")
    .update(
      [
        candidate.sourceItemContentHash ?? "",
        candidate.eventType,
        candidate.title.toLowerCase(),
        candidate.eventDate ?? "",
        candidate.affectedSymbols.map((item) => item.symbol).sort().join(",")
      ].join("\n")
    )
    .digest("hex");
}

function extractOutputText(output: unknown): string | null {
  if (!Array.isArray(output)) return null;
  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object" || !("content" in item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (content && typeof content === "object" && "text" in content && typeof content.text === "string") {
        chunks.push(content.text);
      }
    }
  }
  return chunks.length ? chunks.join("\n") : null;
}

const structuredOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["signals"],
  properties: {
    signals: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "sourceItemContentHash",
          "eventType",
          "title",
          "summary",
          "eventDate",
          "citations",
          "affectedSymbols",
          "directionalSuggestion",
          "reason",
          "breakdown"
        ],
        properties: {
          sourceItemContentHash: { type: ["string", "null"] },
          eventType: {
            type: "string",
            enum: ["macro_release", "central_bank", "earnings", "filing", "policy", "geopolitical", "news"]
          },
          title: { type: "string" },
          summary: { type: "string" },
          eventDate: { type: ["string", "null"] },
          citations: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title", "url", "source"],
              properties: {
                title: { type: "string" },
                url: { type: "string" },
                source: { type: "string" },
                publishedAt: { type: "string" }
              }
            }
          },
          affectedSymbols: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["symbol", "relevance", "rationale"],
              properties: {
                symbol: { type: "string" },
                relevance: { type: "number", minimum: 0, maximum: 100 },
                rationale: { type: "string" }
              }
            }
          },
          directionalSuggestion: { type: "string" },
          reason: { type: "string" },
          breakdown: {
            type: "object",
            additionalProperties: false,
            required: [
              "portfolioRelevance",
              "timeProximity",
              "magnitudeSurprise",
              "sourceCredibility",
              "marketBreadth",
              "modelConfidence"
            ],
            properties: {
              portfolioRelevance: { type: "number", minimum: 0, maximum: 100 },
              timeProximity: { type: "number", minimum: 0, maximum: 100 },
              magnitudeSurprise: { type: "number", minimum: 0, maximum: 100 },
              sourceCredibility: { type: "number", minimum: 0, maximum: 100 },
              marketBreadth: { type: "number", minimum: 0, maximum: 100 },
              modelConfidence: { type: "number", minimum: 0, maximum: 100 }
            }
          }
        }
      }
    }
  }
} as const;

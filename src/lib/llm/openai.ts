import { createHash } from "node:crypto";
import { z } from "zod";

import type { SignalRecordInput, WatchlistItem } from "@/db/repository";
import {
  calculateSignalScore,
  fallbackSignalsFromSources,
  type RawSignalCandidate
} from "@/lib/signals/scoring";
import type { SourceItemInput } from "@/lib/sources/types";

type ExtractedCandidate = Omit<RawSignalCandidate, "breakdown"> & {
  evidenceLevel: "strong" | "medium" | "weak";
  marketMechanism: string;
  whyNow: string;
};

const citationSchema = z.object({
  title: z.string(),
  url: z.string(),
  source: z.string(),
  publishedAt: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? undefined)
});

const affectedSymbolSchema = z.object({
  symbol: z.string(),
  relevance: z.number().min(0).max(100),
  rationale: z.string()
});

const breakdownSchema = z.object({
  portfolioRelevance: z.number().min(0).max(100),
  timeProximity: z.number().min(0).max(100),
  magnitudeSurprise: z.number().min(0).max(100),
  sourceCredibility: z.number().min(0).max(100),
  marketBreadth: z.number().min(0).max(100),
  modelConfidence: z.number().min(0).max(100)
});

const candidateSchema: z.ZodType<RawSignalCandidate> = z.object({
  sourceItemContentHash: z.string().nullable().optional(),
  eventType: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  eventDate: z.string().nullable().optional(),
  citations: z.array(citationSchema).default([]),
  affectedSymbols: z.array(affectedSymbolSchema).default([]),
  directionalSuggestion: z.string().min(1),
  reason: z.string().min(1),
  breakdown: breakdownSchema
}) as z.ZodType<RawSignalCandidate>;

const responseSchema: z.ZodType<{ signals: RawSignalCandidate[] }> = z.object({
  signals: z.array(candidateSchema)
}) as z.ZodType<{ signals: RawSignalCandidate[] }>;

const extractedCandidateSchema: z.ZodType<ExtractedCandidate> = z.object({
  sourceItemContentHash: z.string().nullable().optional(),
  eventType: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  eventDate: z.string().nullable().optional(),
  citations: z.array(citationSchema).default([]),
  affectedSymbols: z.array(affectedSymbolSchema).default([]),
  directionalSuggestion: z.string().min(1),
  reason: z.string().min(1),
  evidenceLevel: z.enum(["strong", "medium", "weak"]).default("medium"),
  marketMechanism: z.string().default(""),
  whyNow: z.string().default("")
}) as z.ZodType<ExtractedCandidate>;

const extractionResponseSchema: z.ZodType<{ candidates: ExtractedCandidate[] }> = z.object({
  candidates: z.array(extractedCandidateSchema).max(30)
}) as z.ZodType<{ candidates: ExtractedCandidate[] }>;

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

  const enrichedSignals = applySourceScoreHints(parsed.data.signals, sourceItems);
  const selectedSignals = selectTopCandidates(enrichedSignals, watchlist, 20);
  const warnings = candidates.warning ? [candidates.warning] : [];
  if (enrichedSignals.length > selectedSignals.length) {
    warnings.push(`LLM returned ${enrichedSignals.length} signals; kept top ${selectedSignals.length}.`);
  }

  return {
    records: toSignalRecords(selectedSignals, watchlist),
    usedFallback: Boolean(candidates.warning),
    warnings
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
  const extracted = await callOpenAiJson(
    buildExtractionPayload(sourceItems, watchlist),
    extractionResponseSchema,
    "extraction"
  );

  if (!extracted.ok) {
    return {
      signals: fallbackSignalsFromSources(sourceItems, watchlist),
      warning: `${extracted.warning}; used deterministic source fallback.`
    };
  }

  if (extracted.data.candidates.length === 0) {
    return { signals: [] };
  }

  const ranked = await callOpenAiJson(
    buildRankingPayload(extracted.data.candidates, sourceItems, watchlist),
    responseSchema,
    "ranking"
  );

  if (!ranked.ok) {
    return {
      signals: fallbackSignalsFromSources(sourceItems, watchlist),
      warning: `${ranked.warning}; used deterministic source fallback.`
    };
  }

  return ranked.data;
}

function buildExtractionPayload(sourceItems: SourceItemInput[], watchlist: WatchlistItem[]) {
  const prioritizedSourceItems = prioritizeSourceItemsForLlm(sourceItems).slice(0, 100);
  return {
    model: process.env.OPENAI_MODEL ?? "gpt-5.5",
    reasoning: { effort: "low" },
    text: {
      format: {
        type: "json_schema",
        name: "macro_radar_extracted_candidates",
        strict: true,
        schema: extractionStructuredOutputSchema
      }
    },
    input: [
      {
        role: "system",
        content:
          "You are Macro Radar's extraction engine. Extract concrete macro, policy, earnings, filing, and company-news candidates from provided source items. Do not score them. Do not invent facts. Use only supplied source hashes and web-search verification when needed."
      },
      {
        role: "user",
        content: JSON.stringify({
          horizon: "days_to_weeks",
          portfolio: watchlist.map((item) => ({
            symbol: item.symbol,
            name: item.name,
            sector: item.sector
          })),
          sourceItems: prioritizedSourceItems.map((item) => ({
            sourceItemContentHash: item.contentHash,
            sourceType: item.sourceType,
            sourceName: item.sourceName,
            title: item.title,
            url: item.url,
            publishedAt: item.publishedAt?.toISOString(),
            summary: item.summary,
            rawJson: item.rawJson
          })),
          extractionRules: [
            "Prefer candidates with direct watchlist impact or broad macro impact.",
            "Ignore generic PR, minor routine releases, or weakly sourced items.",
            "Affected symbols must come from the provided portfolio watchlist only.",
            "For macro events, affectedSymbols can be empty if the event is broad-market.",
            "Every candidate must include at least one citation when a URL exists."
          ]
        })
      }
    ]
  };
}

function buildRankingPayload(
  candidates: ExtractedCandidate[],
  sourceItems: SourceItemInput[],
  watchlist: WatchlistItem[]
) {
  const prioritizedSourceItems = prioritizeSourceItemsForLlm(sourceItems).slice(0, 120);
  return {
    model: process.env.OPENAI_MODEL ?? "gpt-5.5",
    reasoning: { effort: "low" },
    text: {
      format: {
        type: "json_schema",
        name: "macro_radar_ranked_signals",
        strict: true,
        schema: structuredOutputSchema
      }
    },
    input: [
      {
        role: "system",
        content:
          "You are Macro Radar's ranking engine. Rank only evidence-backed investment-relevant events for a days-to-weeks horizon. Be selective. Prefer fewer high-signal outputs over a noisy feed. Never recommend exact orders, price targets, options trades, or auto-trading. Directional suggestions must be review-oriented, such as monitor, reduce concentration risk, hedge consideration, wait for confirmation, or prepare for volatility."
      },
      {
        role: "user",
        content: JSON.stringify({
          portfolio: watchlist.map((item) => ({
            symbol: item.symbol,
            name: item.name,
            sector: item.sector
          })),
          extractedCandidates: candidates,
          sourceItemsByHash: Object.fromEntries(
            prioritizedSourceItems.map((item) => [
              item.contentHash,
              {
                sourceType: item.sourceType,
                sourceName: item.sourceName,
                title: item.title,
                publishedAt: item.publishedAt?.toISOString(),
                summary: item.summary,
                rawJson: item.rawJson,
                url: item.url
              }
            ])
          ),
          scoringRubric: {
            portfolioRelevance:
              "0-100. Direct watchlist ticker impact, sector/theme impact, or broad index/rate sensitivity. Do not use position size.",
            timeProximity: "0-100. Highest for today through 7 days, still relevant up to 45 days.",
            magnitudeSurprise:
              "0-100. Higher when actual data changed sharply, release can surprise consensus, filing/news is material, or earnings could reset expectations.",
            sourceCredibility:
              "0-100. Official macro data, SEC filings, and primary company releases score highest; generic/news-only claims score lower.",
            marketBreadth:
              "0-100. Higher for rates, inflation, labor, GDP, Fed, or events affecting multiple watchlist names or market risk appetite.",
            modelConfidence:
              "0-100. Evidence quality, specificity, non-duplication, and clear causal mechanism. Penalize vague or stale items."
          },
          rankingRules: [
            "Return only candidates that deserve user attention.",
            "For watchlist-specific events, list affectedSymbols with relative relevance scores and mechanisms.",
            "For broad macro events, affectedSymbols can include watchlist names most plausibly exposed; leave empty only if exposure is broad and nonspecific.",
            "Return at most 12 signals. If score would be below 60, usually omit it.",
            "Use normalizedCalendarEvent and macroImpact fields when present. Actual-vs-consensus surprise and source-provided impact scores should strongly inform magnitudeSurprise.",
            "Citations must point to actual source URLs when available.",
            "Directional suggestions must be concrete but not exact trades."
          ]
        })
      }
    ]
  };
}

function applySourceScoreHints(candidates: RawSignalCandidate[], sourceItems: SourceItemInput[]): RawSignalCandidate[] {
  const byHash = new Map(sourceItems.map((item) => [item.contentHash, item]));
  return candidates.map((candidate) => {
    if (!candidate.sourceItemContentHash) return candidate;
    const source = byHash.get(candidate.sourceItemContentHash);
    const macroImpact = readMacroImpact(source?.rawJson);
    if (!source || !macroImpact) return candidate;

    return {
      ...candidate,
      breakdown: {
        ...candidate.breakdown,
        magnitudeSurprise: Math.max(candidate.breakdown.magnitudeSurprise ?? 0, macroImpact.surpriseScore ?? 0),
        sourceCredibility: Math.max(candidate.breakdown.sourceCredibility ?? 0, sourceCredibilityScore(source.sourceType)),
        marketBreadth: Math.max(candidate.breakdown.marketBreadth ?? 0, macroImpact.impactScore ?? 0),
        modelConfidence: Math.max(candidate.breakdown.modelConfidence ?? 0, macroImpact.hasActual ? 78 : 62)
      }
    };
  });
}

function prioritizeSourceItemsForLlm(sourceItems: SourceItemInput[]): SourceItemInput[] {
  return sourceItems
    .slice()
    .sort((left, right) => sourceItemPriority(right) - sourceItemPriority(left));
}

function sourceItemPriority(item: SourceItemInput): number {
  const macroImpact = readMacroImpact(item.rawJson);
  const ageDays = item.publishedAt ? Math.abs(Date.now() - item.publishedAt.getTime()) / (24 * 60 * 60_000) : 30;
  const recencyScore = ageDays <= 3 ? 25 : ageDays <= 14 ? 15 : ageDays <= 45 ? 5 : 0;
  return (macroImpact?.impactScore ?? 45) + sourceCredibilityScore(item.sourceType) * 0.4 + recencyScore;
}

function selectTopCandidates(
  candidates: RawSignalCandidate[],
  watchlist: WatchlistItem[],
  limit: number
): RawSignalCandidate[] {
  return candidates
    .slice()
    .sort((left, right) => calculateSignalScore(right, watchlist).score - calculateSignalScore(left, watchlist).score)
    .slice(0, limit);
}

function readMacroImpact(rawJson?: Record<string, unknown>): {
  surpriseScore?: number;
  impactScore?: number;
  hasActual?: boolean;
} | null {
  const macroImpact = rawJson?.macroImpact;
  if (!macroImpact || typeof macroImpact !== "object") return null;
  const record = macroImpact as Record<string, unknown>;
  return {
    surpriseScore: readNumber(record.surpriseScore),
    impactScore: readNumber(record.impactScore),
    hasActual: record.hasActual === true
  };
}

function sourceCredibilityScore(sourceType: SourceItemInput["sourceType"]): number {
  if (["bls", "fred", "sec"].includes(sourceType)) return 94;
  if (["trading_economics", "fmp", "finnhub"].includes(sourceType)) return 82;
  return 72;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

async function callOpenAiJson<T>(
  payload: Record<string, unknown>,
  schema: z.ZodType<T>,
  phase: string
): Promise<{ ok: true; data: T } | { ok: false; warning: string }> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    return {
      ok: false,
      warning: `OpenAI ${phase} request failed (${response.status})${errorText ? `: ${errorText.slice(0, 500)}` : ""}`
    };
  }

  const data = (await response.json()) as { output_text?: string; output?: unknown };
  const text = data.output_text ?? extractOutputText(data.output);
  if (!text) {
    return { ok: false, warning: `OpenAI ${phase} response had no output_text` };
  }

  try {
    return { ok: true, data: schema.parse(JSON.parse(text)) };
  } catch (error) {
    return {
      ok: false,
      warning: `OpenAI ${phase} JSON validation failed${error instanceof Error ? `: ${error.message}` : ""}`
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

const citationJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["title", "url", "source", "publishedAt"],
  properties: {
    title: { type: "string" },
    url: { type: "string" },
    source: { type: "string" },
    publishedAt: { type: ["string", "null"] }
  }
};

const affectedSymbolJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["symbol", "relevance", "rationale"],
  properties: {
    symbol: { type: "string" },
    relevance: { type: "number", minimum: 0, maximum: 100 },
    rationale: { type: "string" }
  }
};

const extractionStructuredOutputSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["candidates"],
  properties: {
    candidates: {
      type: "array",
      maxItems: 30,
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
          "evidenceLevel",
          "marketMechanism",
          "whyNow"
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
            items: citationJsonSchema
          },
          affectedSymbols: {
            type: "array",
            items: affectedSymbolJsonSchema
          },
          directionalSuggestion: { type: "string" },
          reason: { type: "string" },
          evidenceLevel: { type: "string", enum: ["strong", "medium", "weak"] },
          marketMechanism: { type: "string" },
          whyNow: { type: "string" }
        }
      }
    }
  }
};

const structuredOutputSchema: Record<string, unknown> = {
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
            items: citationJsonSchema
          },
          affectedSymbols: {
            type: "array",
            items: affectedSymbolJsonSchema
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
};

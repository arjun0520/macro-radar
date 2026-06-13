import type { AffectedSymbol, ScoreBreakdown } from "@/db/schema";
import type { WatchlistItem } from "@/db/repository";
import type { SourceItemInput } from "@/lib/sources/types";

export type RawSignalCandidate = {
  sourceItemContentHash?: string | null;
  eventType: string;
  title: string;
  summary: string;
  eventDate?: string | null;
  citations: Array<{ title: string; url: string; source: string; publishedAt?: string }>;
  affectedSymbols: AffectedSymbol[];
  directionalSuggestion: string;
  reason: string;
  breakdown: Partial<ScoreBreakdown>;
};

export function calculateSignalScore(
  candidate: Pick<RawSignalCandidate, "breakdown" | "affectedSymbols" | "eventDate">,
  watchlist: WatchlistItem[]
): { score: number; breakdown: ScoreBreakdown; rankingLabel: string } {
  const base = normalizeBreakdown(candidate.breakdown);
  const weightedPortfolio = portfolioRelevance(candidate.affectedSymbols, watchlist);
  const timeProximity = candidate.eventDate ? proximityScore(new Date(candidate.eventDate)) : base.timeProximity;
  const breakdown: ScoreBreakdown = {
    ...base,
    portfolioRelevance: Math.max(base.portfolioRelevance, weightedPortfolio),
    timeProximity
  };

  const score = clamp(
    Math.round(
      breakdown.portfolioRelevance * 0.28 +
        breakdown.timeProximity * 0.18 +
        breakdown.magnitudeSurprise * 0.18 +
        breakdown.sourceCredibility * 0.14 +
        breakdown.marketBreadth * 0.1 +
        breakdown.modelConfidence * 0.12
    )
  );

  return { score, breakdown, rankingLabel: score >= 80 ? "high" : score >= 65 ? "medium" : "low" };
}

export function fallbackSignalsFromSources(sources: SourceItemInput[], watchlist: WatchlistItem[]): RawSignalCandidate[] {
  return sources
    .map((source) => {
      const affectedSymbols = inferAffectedSymbols(source, watchlist);
      const eventType = inferEventType(source);
      const isPortfolioSpecific = affectedSymbols.length > 0;
      const eventDate = source.publishedAt?.toISOString() ?? null;
      return {
        sourceItemContentHash: source.contentHash,
        eventType,
        title: source.title,
        summary: source.summary || source.title,
        eventDate,
        citations: source.url
          ? [
              {
                title: source.title,
                url: source.url,
                source: source.sourceName,
                publishedAt: source.publishedAt?.toISOString()
              }
            ]
          : [],
        affectedSymbols,
        directionalSuggestion: isPortfolioSpecific
          ? "Review position exposure before acting; consider reducing concentration or waiting for confirmation."
          : "Monitor broad-market exposure; avoid changing positions without confirming market reaction.",
        reason: isPortfolioSpecific
          ? "Source directly references a watchlist holding."
          : "Macro source may affect broad risk appetite but has limited portfolio specificity.",
        breakdown: {
          portfolioRelevance: isPortfolioSpecific ? 85 : 55,
          timeProximity: source.publishedAt ? proximityScore(source.publishedAt) : 55,
          magnitudeSurprise: eventType === "earnings" || eventType === "filing" ? 70 : 60,
          sourceCredibility: source.sourceType === "rss" ? 72 : 88,
          marketBreadth: eventType === "macro_release" || eventType === "central_bank" ? 85 : 55,
          modelConfidence: 55
        }
      };
    })
    .filter((candidate) => candidate.breakdown.portfolioRelevance && candidate.breakdown.portfolioRelevance >= 55);
}

function normalizeBreakdown(input: Partial<ScoreBreakdown>): ScoreBreakdown {
  return {
    portfolioRelevance: clamp(input.portfolioRelevance ?? 50),
    timeProximity: clamp(input.timeProximity ?? 50),
    magnitudeSurprise: clamp(input.magnitudeSurprise ?? 50),
    sourceCredibility: clamp(input.sourceCredibility ?? 70),
    marketBreadth: clamp(input.marketBreadth ?? 50),
    modelConfidence: clamp(input.modelConfidence ?? 50)
  };
}

function portfolioRelevance(affectedSymbols: AffectedSymbol[], watchlist: WatchlistItem[]): number {
  if (affectedSymbols.length === 0) return 45;
  const watchlistSymbols = new Set(watchlist.map((item) => item.symbol.toUpperCase()));
  const relevance = affectedSymbols.reduce((max, item) => {
    if (!watchlistSymbols.has(item.symbol.toUpperCase())) return max;
    return Math.max(max, item.relevance);
  }, 0);
  return clamp(Math.round(relevance));
}

function proximityScore(date: Date): number {
  if (Number.isNaN(date.getTime())) return 50;
  const days = Math.abs(date.getTime() - Date.now()) / (24 * 60 * 60_000);
  if (days <= 2) return 95;
  if (days <= 7) return 85;
  if (days <= 21) return 72;
  if (days <= 45) return 58;
  return 40;
}

function inferAffectedSymbols(source: SourceItemInput, watchlist: WatchlistItem[]): AffectedSymbol[] {
  const haystack = `${source.title} ${source.summary ?? ""} ${JSON.stringify(source.rawJson ?? {})}`.toUpperCase();
  return watchlist
    .filter((item) => haystack.includes(item.symbol.toUpperCase()))
    .map((item) => ({
      symbol: item.symbol,
      relevance: 85,
      rationale: `${item.symbol} appears in ${source.sourceName}.`
    }));
}

function inferEventType(source: SourceItemInput): string {
  const text = `${source.sourceName} ${source.title}`.toLowerCase();
  if (source.sourceType === "finnhub" || text.includes("earnings")) return "earnings";
  if (source.sourceType === "sec" || text.includes("filed")) return "filing";
  if (text.includes("federal reserve") || text.includes("interest rate") || text.includes("fomc")) return "central_bank";
  if (text.includes("cpi") || text.includes("employment") || text.includes("release")) return "macro_release";
  return "news";
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

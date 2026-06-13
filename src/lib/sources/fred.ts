import { stableHash } from "@/lib/sources/hash";
import type { SourceCollectionResult, SourceItemInput } from "@/lib/sources/types";

type FredReleaseDate = {
  release_id: number;
  release_name: string;
  date: string;
};

type FredObservation = {
  date: string;
  value: string;
};

type MacroSeries = {
  seriesId: string;
  label: string;
  unit: string;
  theme: string;
  highImpactKeywords: string[];
};

const HIGH_IMPACT_RELEASE_PATTERNS = [
  /consumer price index/i,
  /\bcpi\b/i,
  /employment situation/i,
  /payroll/i,
  /unemployment/i,
  /producer price index/i,
  /\bppi\b/i,
  /gross domestic product/i,
  /\bgdp\b/i,
  /personal income and outlays/i,
  /\bpce\b/i,
  /retail sales/i,
  /industrial production/i,
  /job openings/i,
  /\bjolts\b/i,
  /federal open market committee/i,
  /\bfomc\b/i
];

const MACRO_SERIES: MacroSeries[] = [
  {
    seriesId: "CPIAUCSL",
    label: "Consumer Price Index",
    unit: "index",
    theme: "inflation",
    highImpactKeywords: ["inflation", "rates", "consumer discretionary", "growth stocks"]
  },
  {
    seriesId: "CPILFESL",
    label: "Core CPI",
    unit: "index",
    theme: "core inflation",
    highImpactKeywords: ["inflation", "rates", "duration-sensitive equities"]
  },
  {
    seriesId: "PCEPI",
    label: "PCE Price Index",
    unit: "index",
    theme: "Fed inflation gauge",
    highImpactKeywords: ["Federal Reserve", "rates", "inflation"]
  },
  {
    seriesId: "PCEPILFE",
    label: "Core PCE Price Index",
    unit: "index",
    theme: "Fed core inflation gauge",
    highImpactKeywords: ["Federal Reserve", "rates", "growth stocks"]
  },
  {
    seriesId: "PAYEMS",
    label: "Nonfarm Payrolls",
    unit: "thousands",
    theme: "labor market",
    highImpactKeywords: ["jobs", "Fed", "cyclical equities"]
  },
  {
    seriesId: "UNRATE",
    label: "Unemployment Rate",
    unit: "%",
    theme: "labor market",
    highImpactKeywords: ["jobs", "recession risk", "cyclicals"]
  },
  {
    seriesId: "JTSJOL",
    label: "Job Openings",
    unit: "thousands",
    theme: "labor demand",
    highImpactKeywords: ["labor demand", "wage pressure", "Fed"]
  },
  {
    seriesId: "RSAFS",
    label: "Retail Sales",
    unit: "millions",
    theme: "consumer demand",
    highImpactKeywords: ["consumer", "retail", "cyclicals"]
  },
  {
    seriesId: "INDPRO",
    label: "Industrial Production",
    unit: "index",
    theme: "industrial cycle",
    highImpactKeywords: ["industrial", "cyclicals", "manufacturing"]
  },
  {
    seriesId: "GDP",
    label: "Gross Domestic Product",
    unit: "billions",
    theme: "growth",
    highImpactKeywords: ["growth", "recession risk", "broad market"]
  }
];

export async function collectFredReleaseItems(daysAhead = 21): Promise<SourceCollectionResult> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    return { items: [], warnings: ["FRED_API_KEY not configured; skipped FRED release calendar."] };
  }

  const realtimeStart = new Date();
  const realtimeEnd = new Date(realtimeStart.getTime() + daysAhead * 24 * 60 * 60_000);
  const params = new URLSearchParams({
    api_key: apiKey,
    file_type: "json",
    realtime_start: toDate(realtimeStart),
    realtime_end: toDate(realtimeEnd),
    include_release_dates_with_no_data: "false"
  });
  const url = `https://api.stlouisfed.org/fred/releases/dates?${params.toString()}`;

  try {
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) {
      throw new Error(`FRED ${response.status}`);
    }
    const payload = (await response.json()) as { release_dates?: FredReleaseDate[] };
    const items: SourceItemInput[] = (payload.release_dates ?? [])
      .filter((release) => HIGH_IMPACT_RELEASE_PATTERNS.some((pattern) => pattern.test(release.release_name)))
      .slice(0, 30)
      .map((release) => ({
        sourceType: "fred",
        sourceName: "FRED High-Impact Release Calendar",
        externalId: `${release.release_id}:${release.date}`,
        title: `${release.release_name} scheduled for ${release.date}`,
        url: `https://fred.stlouisfed.org/release?rid=${release.release_id}`,
        publishedAt: new Date(`${release.date}T12:00:00Z`),
        contentHash: stableHash(["fred-release", String(release.release_id), release.date]),
        summary: `Upcoming high-impact macroeconomic data release: ${release.release_name}. Focus on actual versus prior trend and market expectations when available.`,
        rawJson: { ...release, importance: "high", filter: "high_impact_release_calendar" } as unknown as Record<
          string,
          unknown
        >
      }));
    return { items, warnings: [] };
  } catch (error) {
    return {
      items: [],
      warnings: [`FRED release calendar failed: ${error instanceof Error ? error.message : "unknown error"}`]
    };
  }
}

export async function collectFredMacroIntelligence(): Promise<SourceCollectionResult> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    return { items: [], warnings: ["FRED_API_KEY not configured; skipped FRED macro intelligence."] };
  }

  const items: SourceItemInput[] = [];
  const warnings: string[] = [];

  for (const series of MACRO_SERIES) {
    try {
      const params = new URLSearchParams({
        api_key: apiKey,
        file_type: "json",
        series_id: series.seriesId,
        sort_order: "desc",
        limit: "24"
      });
      const response = await fetch(`https://api.stlouisfed.org/fred/series/observations?${params.toString()}`, {
        next: { revalidate: 3600 }
      });
      if (!response.ok) throw new Error(`FRED ${response.status}`);

      const payload = (await response.json()) as { observations?: FredObservation[] };
      const observations = (payload.observations ?? [])
        .map((observation) => ({ date: observation.date, value: Number(observation.value) }))
        .filter((observation) => Number.isFinite(observation.value));
      const latest = observations[0];
      const previous = observations[1];
      if (!latest || !previous) continue;

      const change = latest.value - previous.value;
      const pctChange = previous.value === 0 ? null : (change / previous.value) * 100;
      const zScore = calculateLatestChangeZScore(observations);
      const direction = change > 0 ? "rose" : change < 0 ? "fell" : "was unchanged";
      const pctText = pctChange == null ? "" : ` (${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(2)}%)`;
      const surpriseText =
        zScore == null
          ? "not enough history for a trend surprise score"
          : `latest move is ${Math.abs(zScore).toFixed(1)} standard deviations from recent changes`;

      items.push({
        sourceType: "fred",
        sourceName: "FRED Macro Intelligence",
        externalId: `${series.seriesId}:${latest.date}`,
        title: `${series.label} ${direction} in latest FRED observation`,
        url: `https://fred.stlouisfed.org/series/${series.seriesId}`,
        publishedAt: new Date(`${latest.date}T12:00:00Z`),
        contentHash: stableHash(["fred-series", series.seriesId, latest.date, String(latest.value)]),
        summary: `${series.label} ${direction} from ${formatNumber(previous.value)} to ${formatNumber(
          latest.value
        )} ${series.unit}${pctText}. ${surpriseText}. Theme: ${series.theme}.`,
        rawJson: {
          seriesId: series.seriesId,
          label: series.label,
          unit: series.unit,
          theme: series.theme,
          highImpactKeywords: series.highImpactKeywords,
          latest,
          previous,
          change,
          pctChange,
          zScore,
          observationCount: observations.length
        }
      });
    } catch (error) {
      warnings.push(
        `FRED macro intelligence failed for ${series.seriesId}: ${error instanceof Error ? error.message : "unknown error"}`
      );
    }
  }

  return { items, warnings };
}

function toDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function calculateLatestChangeZScore(observations: Array<{ date: string; value: number }>): number | null {
  const changes = observations
    .slice()
    .reverse()
    .map((observation, index, sorted) => (index === 0 ? null : observation.value - sorted[index - 1].value))
    .filter((change): change is number => change != null);
  if (changes.length < 6) return null;
  const latest = changes.at(-1);
  if (latest == null) return null;
  const prior = changes.slice(0, -1);
  const mean = prior.reduce((sum, change) => sum + change, 0) / prior.length;
  const variance = prior.reduce((sum, change) => sum + (change - mean) ** 2, 0) / Math.max(prior.length - 1, 1);
  const std = Math.sqrt(variance);
  return std === 0 ? 0 : (latest - mean) / std;
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

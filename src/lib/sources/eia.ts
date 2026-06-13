import { stableHash } from "@/lib/sources/hash";
import type { SourceCollectionResult, SourceItemInput } from "@/lib/sources/types";

type EiaSeriesRow = {
  period?: string;
  value?: number | string;
  units?: string;
  "series-description"?: string;
  series?: string;
};

type EiaResponse = {
  response?: {
    data?: EiaSeriesRow[];
  };
  error?: {
    code?: string;
    message?: string;
  };
};

const EIA_WEEKLY_STOCKS_URL = "https://api.eia.gov/v2/petroleum/stoc/wstk/data/";

export async function collectEiaWeeklyPetroleumStocks(): Promise<SourceCollectionResult> {
  const apiKey = process.env.EIA_API_KEY;
  if (!apiKey) {
    return { items: [], calendarEvents: [], warnings: [] };
  }

  const params = new URLSearchParams({
    frequency: "weekly",
    "data[0]": "value",
    "sort[0][column]": "period",
    "sort[0][direction]": "desc",
    offset: "0",
    length: "24",
    api_key: apiKey
  });

  try {
    const response = await fetch(`${EIA_WEEKLY_STOCKS_URL}?${params.toString()}`, {
      next: { revalidate: 3600 }
    });
    const payload = (await response.json()) as EiaResponse;
    if (!response.ok) {
      throw new Error(payload.error?.message ?? `EIA ${response.status}`);
    }
    if (payload.error) {
      throw new Error(payload.error.message ?? payload.error.code ?? "EIA API error");
    }

    const grouped = groupBySeries(payload.response?.data ?? []);
    const items: SourceItemInput[] = [];

    for (const [seriesKey, rows] of grouped) {
      const latest = rows[0];
      const previous = rows[1];
      const latestValue = parseNumber(latest.value);
      const previousValue = parseNumber(previous?.value);
      const period = latest.period;
      if (!period || latestValue == null) continue;

      const change = previousValue == null ? null : latestValue - previousValue;
      const pctChange = previousValue == null || previousValue === 0 ? null : (change! / previousValue) * 100;
      const surpriseScore = pctChange == null ? 55 : clamp(Math.round(Math.abs(pctChange) * 6 + 45));
      const impactScore = clamp(Math.round(surpriseScore * 0.55 + 82 * 0.45));
      const description = latest["series-description"]?.trim() || seriesKey;
      const contentHash = stableHash(["eia-weekly-petroleum-stocks", seriesKey, period, String(latestValue)]);

      items.push({
        sourceType: "eia",
        sourceName: "EIA Weekly Petroleum Stocks",
        externalId: `${seriesKey}:${period}`,
        title: `${description} latest EIA weekly value`,
        url: "https://www.eia.gov/petroleum/supply/weekly/",
        publishedAt: new Date(`${period}T12:00:00Z`),
        contentHash,
        summary: `${description} was ${formatNumber(latestValue)} ${latest.units ?? ""}${
          change == null
            ? "."
            : `, ${change >= 0 ? "up" : "down"} ${formatNumber(Math.abs(change))}${
                pctChange == null ? "" : ` (${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(1)}%)`
              } from the prior week.`
        } Energy inventory changes can affect oil prices, inflation expectations, transport costs, and energy equities.`,
        rawJson: {
          latest,
          previous,
          latestValue,
          previousValue,
          change,
          pctChange,
          macroImpact: {
            surprisePct: pctChange,
            surpriseScore,
            impactScore,
            importanceScore: 82,
            hasActual: true,
            hasConsensus: false,
            hasPrevious: previousValue != null
          }
        }
      });
    }

    return { items: items.slice(0, 6), calendarEvents: [], warnings: [] };
  } catch (error) {
    return {
      items: [],
      calendarEvents: [],
      warnings: [`EIA weekly petroleum stocks failed: ${error instanceof Error ? error.message : "unknown error"}`]
    };
  }
}

function groupBySeries(rows: EiaSeriesRow[]): Map<string, EiaSeriesRow[]> {
  const grouped = new Map<string, EiaSeriesRow[]>();
  for (const row of rows) {
    const key = row.series ?? row["series-description"] ?? "petroleum-stocks";
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  return grouped;
}

function parseNumber(value?: string | number | null): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

import { stableHash } from "@/lib/sources/hash";
import type { SourceCollectionResult, SourceItemInput } from "@/lib/sources/types";

type BlsSeriesConfig = {
  seriesId: string;
  label: string;
  category: string;
  unit: string;
};

type BlsDatum = {
  year: string;
  period: string;
  periodName: string;
  value: string;
  footnotes?: Array<{ code?: string; text?: string }>;
};

type BlsSeries = {
  seriesID: string;
  data?: BlsDatum[];
};

const BLS_SERIES: BlsSeriesConfig[] = [
  { seriesId: "CUUR0000SA0", label: "CPI-U", category: "inflation", unit: "index" },
  { seriesId: "CUUR0000SA0L1E", label: "Core CPI", category: "core inflation", unit: "index" },
  { seriesId: "LNS14000000", label: "Unemployment Rate", category: "labor market", unit: "%" },
  { seriesId: "CES0000000001", label: "Total Nonfarm Payrolls", category: "labor market", unit: "thousands" },
  { seriesId: "CES0500000003", label: "Average Hourly Earnings", category: "wages", unit: "dollars" }
];

export async function collectBlsLatestIndicators(): Promise<SourceCollectionResult> {
  const body: Record<string, unknown> = {
    seriesid: BLS_SERIES.map((series) => series.seriesId),
    latest: true
  };
  if (process.env.BLS_API_KEY) {
    body.registrationkey = process.env.BLS_API_KEY;
  }

  try {
    const response = await fetch("https://api.bls.gov/publicAPI/v2/timeseries/data/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      next: { revalidate: 3600 }
    });
    if (!response.ok) throw new Error(`BLS ${response.status}`);

    const payload = (await response.json()) as { status?: string; message?: string[]; Results?: { series?: BlsSeries[] } };
    if (payload.status && payload.status !== "REQUEST_SUCCEEDED") {
      throw new Error(payload.message?.join("; ") || payload.status);
    }

    const configBySeries = new Map(BLS_SERIES.map((series) => [series.seriesId, series]));
    const items: SourceItemInput[] = [];

    for (const series of payload.Results?.series ?? []) {
      const config = configBySeries.get(series.seriesID);
      const latest = series.data?.[0];
      const previous = series.data?.[1];
      if (!config || !latest) continue;

      const latestValue = parseNumber(latest.value);
      const previousValue = parseNumber(previous?.value);
      const change = latestValue == null || previousValue == null ? null : latestValue - previousValue;
      const eventDate = periodToDate(latest);
      const zScore = null;
      const contentHash = stableHash(["bls", series.seriesID, latest.year, latest.period, latest.value]);

      items.push({
        sourceType: "bls",
        sourceName: "BLS Public Data API",
        externalId: `${series.seriesID}:${latest.year}:${latest.period}`,
        title: `${config.label} latest BLS observation`,
        url: `https://beta.bls.gov/dataViewer/view/timeseries/${series.seriesID}`,
        publishedAt: eventDate,
        contentHash,
        summary: `${config.label} latest value was ${latest.value} ${config.unit}${
          change == null ? "" : `, ${change >= 0 ? "up" : "down"} ${Math.abs(change).toFixed(2)} from the previous observation`
        }. Category: ${config.category}.`,
        rawJson: {
          seriesId: series.seriesID,
          label: config.label,
          category: config.category,
          unit: config.unit,
          latest,
          previous,
          change,
          zScore,
          macroImpact: {
            surpriseScore: change == null ? 50 : Math.min(90, Math.round(Math.abs(change) * 12 + 45)),
            impactScore: change == null ? 55 : Math.min(90, Math.round(Math.abs(change) * 10 + 55)),
            importanceScore: ["inflation", "core inflation", "labor market"].includes(config.category) ? 90 : 72,
            hasActual: true,
            hasConsensus: false,
            hasPrevious: previousValue != null
          }
        }
      });
    }

    return { items, calendarEvents: [], warnings: [] };
  } catch (error) {
    return {
      items: [],
      calendarEvents: [],
      warnings: [`BLS Public Data API failed: ${error instanceof Error ? error.message : "unknown error"}`]
    };
  }
}

function periodToDate(datum: BlsDatum): Date | null {
  const month = /^M(\d{2})$/.exec(datum.period)?.[1];
  if (!month) return new Date(`${datum.year}-12-31T12:00:00Z`);
  return new Date(`${datum.year}-${month}-01T12:00:00Z`);
}

function parseNumber(value?: string | null): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

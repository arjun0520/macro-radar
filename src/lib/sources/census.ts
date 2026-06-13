import { stableHash } from "@/lib/sources/hash";
import type { SourceCollectionResult, SourceItemInput } from "@/lib/sources/types";

type CensusRetailSalesRow = {
  cell_value?: string;
  time_slot_id?: string;
  time?: string;
  category_code?: string;
  data_type_code?: string;
  seasonally_adj?: string;
};

const CENSUS_RETAIL_SALES_URL = "https://api.census.gov/data/timeseries/eits/mrts";
const RETAIL_CATEGORY_CODE = "44X72";

export async function collectCensusRetailSales(): Promise<SourceCollectionResult> {
  const apiKey = process.env.CENSUS_API_KEY;
  if (!apiKey) {
    return { items: [], calendarEvents: [], warnings: [] };
  }

  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), Math.max(now.getUTCMonth() - 13, 0), 1));
  const params = new URLSearchParams({
    get: "cell_value,time_slot_id,time,category_code,data_type_code,seasonally_adj",
    time: `from ${from.toISOString().slice(0, 7)}`,
    category_code: RETAIL_CATEGORY_CODE,
    data_type_code: "SM",
    seasonally_adj: "yes",
    key: apiKey
  });

  try {
    const response = await fetch(`${CENSUS_RETAIL_SALES_URL}?${params.toString()}`, {
      next: { revalidate: 3600 }
    });
    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();
    if (!response.ok || !contentType.includes("application/json")) {
      throw new Error(`Census ${response.status}: ${text.replace(/\s+/g, " ").slice(0, 180)}`);
    }

    const rows = parseCensusTable(JSON.parse(text))
      .map((row) => ({ row, value: parseNumber(row.cell_value), date: monthToDate(row.time) }))
      .filter((entry): entry is { row: CensusRetailSalesRow; value: number; date: Date } => entry.value != null && entry.date != null)
      .sort((left, right) => right.date.getTime() - left.date.getTime());

    const latest = rows[0];
    const previous = rows[1];
    if (!latest) return { items: [], calendarEvents: [], warnings: [] };

    const change = previous ? latest.value - previous.value : null;
    const pctChange = previous && previous.value !== 0 ? (change! / previous.value) * 100 : null;
    const surpriseScore = pctChange == null ? 60 : clamp(Math.round(Math.abs(pctChange) * 12 + 45));
    const impactScore = clamp(Math.round(surpriseScore * 0.55 + 88 * 0.45));
    const contentHash = stableHash(["census-retail-sales", latest.row.time, String(latest.value)]);

    const item: SourceItemInput = {
      sourceType: "census",
      sourceName: "Census Monthly Retail Trade Survey",
      externalId: `mrts:${RETAIL_CATEGORY_CODE}:${latest.row.time ?? latest.date.toISOString()}`,
      title: `Retail sales latest Census MRTS observation`,
      url: "https://www.census.gov/retail/index.html",
      publishedAt: latest.date,
      contentHash,
      summary: `Seasonally adjusted U.S. retail and food services sales were ${formatNumber(latest.value)}${
        previous && change != null
          ? `, ${change >= 0 ? "up" : "down"} ${formatNumber(Math.abs(change))}${
              pctChange == null ? "" : ` (${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(1)}%)`
            } from ${previous.row.time}.`
          : "."
      } Retail sales are a direct consumer-demand signal for discretionary, payments, logistics, and broad cyclical exposure.`,
      rawJson: {
        latest: latest.row,
        previous: previous?.row ?? null,
        latestValue: latest.value,
        previousValue: previous?.value ?? null,
        change,
        pctChange,
        macroImpact: {
          surprisePct: pctChange,
          surpriseScore,
          impactScore,
          importanceScore: 88,
          hasActual: true,
          hasConsensus: false,
          hasPrevious: previous != null
        }
      }
    };

    return { items: [item], calendarEvents: [], warnings: [] };
  } catch (error) {
    return {
      items: [],
      calendarEvents: [],
      warnings: [`Census Monthly Retail Trade Survey failed: ${error instanceof Error ? error.message : "unknown error"}`]
    };
  }
}

function parseCensusTable(payload: unknown): CensusRetailSalesRow[] {
  if (!Array.isArray(payload) || payload.length < 2 || !Array.isArray(payload[0])) return [];
  const headers = payload[0] as string[];
  return payload.slice(1).filter(Array.isArray).map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = String(row[index] ?? "");
    });
    return record as CensusRetailSalesRow;
  });
}

function monthToDate(value?: string): Date | null {
  if (!/^\d{4}-\d{2}$/.test(value ?? "")) return null;
  return new Date(`${value}-01T12:00:00Z`);
}

function parseNumber(value?: string | null): number | null {
  if (!value) return null;
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

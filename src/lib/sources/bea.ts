import { stableHash } from "@/lib/sources/hash";
import type { SourceCollectionResult, SourceItemInput } from "@/lib/sources/types";

type BeaDataRow = {
  TimePeriod?: string;
  DataValue?: string;
  LineDescription?: string;
  LineNumber?: string;
  METRIC_NAME?: string;
  CL_UNIT?: string;
};

type BeaResponse = {
  BEAAPI?: {
    Results?: {
      Error?: {
        APIErrorCode?: string;
        APIErrorDescription?: string;
      };
      Data?: BeaDataRow[];
    };
  };
};

const BEA_DATA_URL = "https://apps.bea.gov/api/data";

export async function collectBeaGdpGrowth(): Promise<SourceCollectionResult> {
  const apiKey = process.env.BEA_API_KEY;
  if (!apiKey) {
    return { items: [], calendarEvents: [], warnings: [] };
  }

  const params = new URLSearchParams({
    UserID: apiKey,
    method: "GETDATA",
    datasetname: "NIPA",
    TableName: "T10101",
    LineNumber: "1",
    Frequency: "Q",
    Year: "ALL",
    ResultFormat: "JSON"
  });

  try {
    const response = await fetch(`${BEA_DATA_URL}?${params.toString()}`, { next: { revalidate: 3600 } });
    if (!response.ok) throw new Error(`BEA ${response.status}`);

    const payload = (await response.json()) as BeaResponse;
    const apiError = payload.BEAAPI?.Results?.Error;
    if (apiError) {
      throw new Error(apiError.APIErrorDescription ?? apiError.APIErrorCode ?? "BEA API error");
    }

    const rows = (payload.BEAAPI?.Results?.Data ?? [])
      .map((row) => ({ row, value: parseNumber(row.DataValue), date: quarterToDate(row.TimePeriod) }))
      .filter((entry): entry is { row: BeaDataRow; value: number; date: Date } => entry.value != null && entry.date != null)
      .sort((left, right) => right.date.getTime() - left.date.getTime());

    const latest = rows[0];
    const previous = rows[1];
    if (!latest) return { items: [], calendarEvents: [], warnings: [] };

    const change = previous ? latest.value - previous.value : null;
    const surpriseScore = change == null ? 65 : clamp(Math.round(Math.abs(change) * 9 + 58));
    const impactScore = clamp(Math.round(surpriseScore * 0.55 + 94 * 0.45));
    const contentHash = stableHash(["bea-gdp-growth", latest.row.TimePeriod, String(latest.value)]);
    const label = latest.row.LineDescription?.trim() || "Real GDP growth";

    const item: SourceItemInput = {
      sourceType: "bea",
      sourceName: "BEA NIPA API",
      externalId: `T10101:1:${latest.row.TimePeriod ?? latest.date.toISOString()}`,
      title: `${label} was ${latest.value.toFixed(1)}% in latest BEA quarter`,
      url: "https://www.bea.gov/data/gdp/gross-domestic-product",
      publishedAt: latest.date,
      contentHash,
      summary: `${label} was ${latest.value.toFixed(1)}% for ${latest.row.TimePeriod ?? "the latest quarter"}${
        previous && change != null
          ? `, ${change >= 0 ? "up" : "down"} ${Math.abs(change).toFixed(1)} percentage points from ${previous.row.TimePeriod}.`
          : "."
      } GDP growth changes affect cyclical demand, earnings expectations, rates, and broad market risk appetite.`,
      rawJson: {
        latest: latest.row,
        previous: previous?.row ?? null,
        latestValue: latest.value,
        previousValue: previous?.value ?? null,
        change,
        macroImpact: {
          surpriseScore,
          impactScore,
          importanceScore: 94,
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
      warnings: [`BEA NIPA API failed: ${error instanceof Error ? error.message : "unknown error"}`]
    };
  }
}

function quarterToDate(value?: string): Date | null {
  const match = /^(\d{4})Q([1-4])$/.exec(value ?? "");
  if (!match) return null;
  const year = Number(match[1]);
  const quarter = Number(match[2]);
  const month = quarter * 3;
  return new Date(`${year}-${String(month).padStart(2, "0")}-01T12:00:00Z`);
}

function parseNumber(value?: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

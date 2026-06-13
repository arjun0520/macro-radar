import { stableHash } from "@/lib/sources/hash";
import type { SourceCollectionResult, SourceItemInput } from "@/lib/sources/types";

type TreasuryInterestRateRow = {
  record_date?: string;
  security_type_desc?: string;
  security_desc?: string;
  avg_interest_rate_amt?: string;
};

const TREASURY_AVERAGE_RATE_URL =
  "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates";

export async function collectTreasuryAverageInterestRates(): Promise<SourceCollectionResult> {
  const params = new URLSearchParams({
    sort: "-record_date",
    "page[size]": "60",
    format: "json"
  });

  try {
    const response = await fetch(`${TREASURY_AVERAGE_RATE_URL}?${params.toString()}`, {
      next: { revalidate: 3600 }
    });
    if (!response.ok) throw new Error(`Treasury FiscalData ${response.status}`);

    const payload = (await response.json()) as { data?: TreasuryInterestRateRow[] };
    const rowsBySecurity = groupBySecurity(payload.data ?? []);
    const items: SourceItemInput[] = [];

    for (const [securityDescription, rows] of rowsBySecurity) {
      const latest = rows[0];
      const previous = rows[1];
      const latestRate = parseNumber(latest.avg_interest_rate_amt);
      const previousRate = parseNumber(previous?.avg_interest_rate_amt);
      const change = latestRate == null || previousRate == null ? null : latestRate - previousRate;
      const recordDate = latest.record_date;
      if (!recordDate || latestRate == null) continue;

      const surpriseScore = change == null ? 55 : clamp(Math.round(Math.abs(change) * 40 + 55));
      const impactScore = clamp(Math.round(surpriseScore * 0.6 + 92 * 0.4));
      const contentHash = stableHash(["treasury-average-rate", securityDescription, recordDate, String(latestRate)]);

      items.push({
        sourceType: "treasury",
        sourceName: "U.S. Treasury FiscalData Average Interest Rates",
        externalId: `${securityDescription}:${recordDate}`,
        title: `${securityDescription} average interest rate was ${latestRate.toFixed(3)}%`,
        url: `${TREASURY_AVERAGE_RATE_URL}?${params.toString()}`,
        publishedAt: new Date(`${recordDate}T12:00:00Z`),
        contentHash,
        summary: `${securityDescription} average interest rate was ${latestRate.toFixed(3)}%${
          change == null
            ? "."
            : `, ${change >= 0 ? "up" : "down"} ${Math.abs(change).toFixed(3)} percentage points from the prior observation.`
        } Treasury funding costs and rate trends affect discount rates, banks, housing, and duration-sensitive equities.`,
        rawJson: {
          latest,
          previous,
          latestRate,
          previousRate,
          change,
          macroImpact: {
            surpriseScore,
            impactScore,
            importanceScore: 92,
            hasActual: true,
            hasConsensus: false,
            hasPrevious: previousRate != null
          }
        }
      });
    }

    return { items: items.slice(0, 8), calendarEvents: [], warnings: [] };
  } catch (error) {
    return {
      items: [],
      calendarEvents: [],
      warnings: [`Treasury FiscalData average interest rates failed: ${error instanceof Error ? error.message : "unknown error"}`]
    };
  }
}

function groupBySecurity(rows: TreasuryInterestRateRow[]): Map<string, TreasuryInterestRateRow[]> {
  const grouped = new Map<string, TreasuryInterestRateRow[]>();
  for (const row of rows) {
    const securityDescription = row.security_desc?.trim();
    if (!securityDescription) continue;
    grouped.set(securityDescription, [...(grouped.get(securityDescription) ?? []), row]);
  }
  return grouped;
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

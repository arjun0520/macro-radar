import { stableHash } from "@/lib/sources/hash";
import type { EconomicCalendarEventInput, SourceCollectionResult, SourceItemInput, SourceType } from "@/lib/sources/types";

type TradingEconomicsEvent = {
  CalendarId?: string | number;
  Country?: string;
  Category?: string;
  Event?: string;
  Date?: string;
  Actual?: string | number | null;
  Previous?: string | number | null;
  Forecast?: string | number | null;
  TEForecast?: string | number | null;
  Importance?: string | number | null;
  Reference?: string;
  Source?: string;
  SourceURL?: string;
  URL?: string;
};

type FmpCalendarEvent = {
  date?: string;
  country?: string;
  event?: string;
  currency?: string;
  previous?: string | number | null;
  estimate?: string | number | null;
  actual?: string | number | null;
  change?: string | number | null;
  impact?: string | null;
};

const HIGH_IMPACT_TERMS = [
  "cpi",
  "consumer price",
  "pce",
  "personal consumption",
  "nonfarm payroll",
  "unemployment",
  "fomc",
  "fed interest rate",
  "gdp",
  "retail sales",
  "producer price",
  "ppi",
  "jolts",
  "job openings",
  "ism",
  "pmi",
  "industrial production",
  "consumer confidence"
];

export async function collectTradingEconomicsCalendar(daysBack = 2, daysAhead = 21): Promise<SourceCollectionResult> {
  const credential = process.env.TRADING_ECONOMICS_API_KEY;
  if (!credential) {
    return {
      items: [],
      calendarEvents: [],
      warnings: ["TRADING_ECONOMICS_API_KEY not configured; skipped Trading Economics calendar."]
    };
  }

  const from = toDate(new Date(Date.now() - daysBack * 24 * 60 * 60_000));
  const to = toDate(new Date(Date.now() + daysAhead * 24 * 60 * 60_000));
  const params = new URLSearchParams({ c: credential, f: "json" });
  const url = `https://api.tradingeconomics.com/calendar/country/united%20states/${from}/${to}?${params.toString()}`;

  try {
    const response = await fetch(url, { next: { revalidate: 1800 } });
    if (!response.ok) throw new Error(`Trading Economics ${response.status}`);
    const payload = (await response.json()) as TradingEconomicsEvent[];
    return normalizeCalendarEvents(
      "trading_economics",
      "Trading Economics Calendar",
      payload
        .filter((event) => isUnitedStates(event.Country) && isRelevantMacroEvent(event.Event, event.Category, event.Importance))
        .slice(0, 60)
        .map((event) => {
          const actual = parseNumber(event.Actual);
          const previous = parseNumber(event.Previous);
          const forecast = parseNumber(event.Forecast ?? event.TEForecast);
          return {
            externalId: String(event.CalendarId ?? `${event.Country}:${event.Event}:${event.Date}`),
            country: event.Country ?? "United States",
            category: event.Category ?? null,
            eventName: event.Event?.trim() || "Economic calendar event",
            eventDate: parseDate(event.Date),
            actual,
            previous,
            consensus: forecast,
            forecast,
            importance: normalizeImportance(event.Importance),
            url: normalizeTradingEconomicsUrl(event.URL) ?? event.SourceURL ?? "https://tradingeconomics.com/calendar",
            rawJson: event as Record<string, unknown>
          };
        })
    );
  } catch (error) {
    return {
      items: [],
      calendarEvents: [],
      warnings: [`Trading Economics calendar failed: ${error instanceof Error ? error.message : "unknown error"}`]
    };
  }
}

export async function collectFmpEconomicCalendar(daysBack = 2, daysAhead = 21): Promise<SourceCollectionResult> {
  const apiKey = process.env.FMP_API_KEY ?? process.env.FINANCIAL_MODELING_PREP_API_KEY;
  if (!apiKey) {
    return {
      items: [],
      calendarEvents: [],
      warnings: ["FMP_API_KEY not configured; skipped Financial Modeling Prep economic calendar."]
    };
  }

  const from = toDate(new Date(Date.now() - daysBack * 24 * 60 * 60_000));
  const to = toDate(new Date(Date.now() + daysAhead * 24 * 60 * 60_000));
  const params = new URLSearchParams({ from, to, apikey: apiKey });
  const url = `https://financialmodelingprep.com/stable/economic-calendar?${params.toString()}`;

  try {
    const response = await fetch(url, { next: { revalidate: 1800 } });
    if (!response.ok) throw new Error(`FMP ${response.status}`);
    const payload = (await response.json()) as FmpCalendarEvent[];
    return normalizeCalendarEvents(
      "fmp",
      "FMP Economic Calendar",
      payload
        .filter((event) => isUnitedStates(event.country) && isRelevantMacroEvent(event.event, undefined, event.impact))
        .slice(0, 60)
        .map((event) => {
          const actual = parseNumber(event.actual);
          const previous = parseNumber(event.previous);
          const consensus = parseNumber(event.estimate);
          return {
            externalId: `${event.country ?? "US"}:${event.event ?? "event"}:${event.date ?? ""}`,
            country: event.country ?? "United States",
            category: event.currency ?? null,
            eventName: event.event?.trim() || "Economic calendar event",
            eventDate: parseDate(event.date),
            actual,
            previous,
            consensus,
            forecast: consensus,
            importance: normalizeImportance(event.impact),
            url: "https://financialmodelingprep.com/economic-calendar",
            rawJson: event as Record<string, unknown>
          };
        })
    );
  } catch (error) {
    return {
      items: [],
      calendarEvents: [],
      warnings: [`FMP economic calendar failed: ${error instanceof Error ? error.message : "unknown error"}`]
    };
  }
}

function normalizeCalendarEvents(
  provider: SourceType,
  sourceName: string,
  events: Array<Omit<EconomicCalendarEventInput, "provider" | "sourceItemContentHash">>
): SourceCollectionResult {
  const items: SourceItemInput[] = [];
  const calendarEvents: EconomicCalendarEventInput[] = [];

  for (const event of events) {
    const impact = calculateMacroImpact(event);
    const contentHash = stableHash([
      provider,
      event.externalId,
      event.eventName,
      event.eventDate?.toISOString() ?? "",
      String(event.actual ?? ""),
      String(event.consensus ?? ""),
      String(event.previous ?? "")
    ]);
    const summary = buildCalendarSummary(event, impact);

    items.push({
      sourceType: provider,
      sourceName,
      externalId: event.externalId,
      title: `${event.eventName}${event.eventDate ? ` on ${toDate(event.eventDate)}` : ""}`,
      url: event.url ?? null,
      publishedAt: event.eventDate ?? null,
      contentHash,
      summary,
      rawJson: {
        ...event.rawJson,
        normalizedCalendarEvent: {
          provider,
          country: event.country,
          category: event.category,
          eventName: event.eventName,
          eventDate: event.eventDate?.toISOString() ?? null,
          actual: event.actual ?? null,
          previous: event.previous ?? null,
          consensus: event.consensus ?? null,
          forecast: event.forecast ?? null,
          importance: event.importance ?? null
        },
        macroImpact: impact
      }
    });

    calendarEvents.push({
      ...event,
      provider,
      sourceItemContentHash: contentHash,
      impactScore: impact.impactScore,
      surpriseScore: impact.surpriseScore,
      rawJson: {
        ...event.rawJson,
        macroImpact: impact
      }
    });
  }

  return { items, calendarEvents, warnings: [] };
}

function buildCalendarSummary(
  event: Omit<EconomicCalendarEventInput, "provider" | "sourceItemContentHash">,
  impact: ReturnType<typeof calculateMacroImpact>
): string {
  const parts = [`${event.eventName} economic calendar event.`];
  if (event.actual != null) parts.push(`Actual: ${event.actual}.`);
  if (event.consensus != null) parts.push(`Consensus: ${event.consensus}.`);
  if (event.previous != null) parts.push(`Previous: ${event.previous}.`);
  if (event.importance) parts.push(`Importance: ${event.importance}.`);
  parts.push(`Deterministic surprise score: ${impact.surpriseScore}/100; impact score: ${impact.impactScore}/100.`);
  return parts.join(" ");
}

function calculateMacroImpact(event: Pick<EconomicCalendarEventInput, "actual" | "previous" | "consensus" | "forecast" | "importance">) {
  const comparison = event.consensus ?? event.forecast ?? event.previous ?? null;
  const denominator = comparison == null ? null : Math.max(Math.abs(comparison), 1);
  const surprisePct = event.actual == null || comparison == null || denominator == null ? null : ((event.actual - comparison) / denominator) * 100;
  const surpriseScore = surprisePct == null ? 45 : clamp(Math.round(Math.abs(surprisePct) * 8 + 35));
  const importanceScore = importanceToScore(event.importance);
  const impactScore = clamp(Math.round(surpriseScore * 0.55 + importanceScore * 0.45));
  return {
    surprisePct,
    surpriseScore,
    importanceScore,
    impactScore,
    hasActual: event.actual != null,
    hasConsensus: event.consensus != null || event.forecast != null,
    hasPrevious: event.previous != null
  };
}

function isUnitedStates(country?: string | null): boolean {
  if (!country) return true;
  return /^(united states|usa|us|u\.s\.|united states of america)$/i.test(country.trim());
}

function isRelevantMacroEvent(name?: string | null, category?: string | null, importance?: string | number | null): boolean {
  const text = `${name ?? ""} ${category ?? ""}`.toLowerCase();
  if (HIGH_IMPACT_TERMS.some((term) => text.includes(term))) return true;
  return importanceToScore(normalizeImportance(importance)) >= 75;
}

function normalizeImportance(value?: string | number | null): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    if (value >= 3) return "high";
    if (value >= 2) return "medium";
    return "low";
  }
  const normalized = value.trim().toLowerCase();
  if (["3", "high", "high volatility"].includes(normalized)) return "high";
  if (["2", "medium", "moderate", "medium volatility"].includes(normalized)) return "medium";
  if (["1", "low", "low volatility"].includes(normalized)) return "low";
  return normalized;
}

function importanceToScore(value?: string | null): number {
  if (!value) return 55;
  if (/high|3/i.test(value)) return 92;
  if (/medium|moderate|2/i.test(value)) return 72;
  if (/low|1/i.test(value)) return 45;
  return 60;
}

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseNumber(value?: string | number | null): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const trimmed = value.trim();
  const suffix = /([kmb])$/i.exec(trimmed)?.[1]?.toLowerCase();
  const normalized = trimmed.replace(/[%,$]/g, "").replace(/[kmb]$/i, "").trim();
  const multiplier = suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : suffix === "b" ? 1_000_000_000 : 1;
  const parsed = Number(normalized) * multiplier;
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTradingEconomicsUrl(value?: string | null): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://tradingeconomics.com${value.startsWith("/") ? value : `/${value}`}`;
}

function toDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

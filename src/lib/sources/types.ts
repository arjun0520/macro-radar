export type SourceType =
  | "fred"
  | "bls"
  | "sec"
  | "finnhub"
  | "rss"
  | "trading_economics"
  | "fmp"
  | "treasury"
  | "bea"
  | "eia"
  | "census";

export type SourceItemInput = {
  sourceType: SourceType;
  sourceName: string;
  externalId: string;
  title: string;
  url?: string | null;
  publishedAt?: Date | null;
  contentHash: string;
  summary?: string | null;
  rawJson?: Record<string, unknown>;
};

export type SourceCollectorStat = {
  sourceType: SourceType;
  sourceName: string;
  itemCount: number;
  calendarEventCount?: number;
};

export type EconomicCalendarEventInput = {
  provider: SourceType;
  externalId: string;
  country?: string | null;
  category?: string | null;
  eventName: string;
  eventDate?: Date | null;
  actual?: number | null;
  previous?: number | null;
  consensus?: number | null;
  forecast?: number | null;
  importance?: string | null;
  impactScore?: number | null;
  surpriseScore?: number | null;
  sourceItemContentHash?: string | null;
  url?: string | null;
  rawJson?: Record<string, unknown>;
};

export type SourceCollectionResult = {
  items: SourceItemInput[];
  calendarEvents?: EconomicCalendarEventInput[];
  warnings: string[];
  stats?: SourceCollectorStat[];
};

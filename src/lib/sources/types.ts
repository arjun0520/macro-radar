export type SourceType = "fred" | "bls" | "sec" | "finnhub" | "rss";

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
};

export type SourceCollectionResult = {
  items: SourceItemInput[];
  warnings: string[];
  stats?: SourceCollectorStat[];
};

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

export const jobStatusEnum = pgEnum("job_status", ["running", "completed", "failed", "skipped"]);
export const alertStatusEnum = pgEnum("alert_status", ["pending", "sent", "skipped", "failed"]);

export type Citation = {
  title: string;
  url: string;
  source: string;
  publishedAt?: string;
};

export type ScoreBreakdown = {
  portfolioRelevance: number;
  timeProximity: number;
  magnitudeSurprise: number;
  sourceCredibility: number;
  marketBreadth: number;
  modelConfidence: number;
};

export type AffectedSymbol = {
  symbol: string;
  relevance: number;
  rationale: string;
};

export const watchlistItems = pgTable(
  "watchlist_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    symbol: varchar("symbol", { length: 16 }).notNull(),
    name: text("name"),
    assetType: varchar("asset_type", { length: 24 }).notNull().default("stock_etf"),
    sector: text("sector"),
    portfolioWeight: real("portfolio_weight"),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    symbolIdx: uniqueIndex("ux_watchlist_symbol").on(table.symbol),
    activeIdx: index("ix_watchlist_active").on(table.active)
  })
);

export const sourceItems = pgTable(
  "source_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceType: varchar("source_type", { length: 32 }).notNull(),
    sourceName: text("source_name").notNull(),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    url: text("url"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    summary: text("summary"),
    rawJson: jsonb("raw_json").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    contentHashIdx: uniqueIndex("ux_source_items_content_hash").on(table.contentHash),
    sourceIdx: index("ix_source_items_source").on(table.sourceType, table.sourceName),
    publishedIdx: index("ix_source_items_published_at").on(table.publishedAt)
  })
);

export const macroEvents = pgTable(
  "macro_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceItemId: uuid("source_item_id").references(() => sourceItems.id, { onDelete: "set null" }),
    fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
    eventType: varchar("event_type", { length: 40 }).notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    eventDate: timestamp("event_date", { withTimezone: true }),
    impactHorizon: varchar("impact_horizon", { length: 32 }).notNull().default("days_to_weeks"),
    citations: jsonb("citations").$type<Citation[]>().notNull().default(sql`'[]'::jsonb`),
    rawModelJson: jsonb("raw_model_json").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    fingerprintIdx: uniqueIndex("ux_macro_events_fingerprint").on(table.fingerprint),
    eventDateIdx: index("ix_macro_events_event_date").on(table.eventDate),
    typeIdx: index("ix_macro_events_type").on(table.eventType)
  })
);

export const signalScores = pgTable(
  "signal_scores",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id").notNull().references(() => macroEvents.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    rankingLabel: varchar("ranking_label", { length: 24 }).notNull(),
    reason: text("reason").notNull(),
    directionalSuggestion: text("directional_suggestion").notNull(),
    breakdown: jsonb("breakdown").$type<ScoreBreakdown>().notNull(),
    affectedSymbols: jsonb("affected_symbols").$type<AffectedSymbol[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    eventIdx: uniqueIndex("ux_signal_scores_event").on(table.eventId),
    scoreIdx: index("ix_signal_scores_score").on(table.score)
  })
);

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id").notNull().references(() => macroEvents.id, { onDelete: "cascade" }),
    channel: varchar("channel", { length: 24 }).notNull(),
    threshold: integer("threshold").notNull(),
    status: alertStatusEnum("status").notNull().default("pending"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    error: text(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    alertEventChannelIdx: uniqueIndex("ux_alert_event_channel").on(table.eventId, table.channel),
    statusIdx: index("ix_alert_status").on(table.status)
  })
);

export const jobRuns = pgTable(
  "job_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobType: varchar("job_type", { length: 64 }).notNull(),
    runKey: varchar("run_key", { length: 128 }).notNull(),
    status: jobStatusEnum("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    lockExpiresAt: timestamp("lock_expires_at", { withTimezone: true }).notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    error: text()
  },
  (table) => ({
    runKeyIdx: uniqueIndex("ux_job_runs_run_key").on(table.runKey),
    statusIdx: index("ix_job_runs_status").on(table.status),
    typeStartedIdx: index("ix_job_runs_type_started").on(table.jobType, table.startedAt)
  })
);

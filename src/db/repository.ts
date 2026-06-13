import "server-only";

import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/db/client";
import {
  alerts,
  type AffectedSymbol,
  type Citation,
  jobRuns,
  macroEvents,
  type ScoreBreakdown,
  signalFeedback,
  signalScores,
  sourceItems,
  watchlistItems
} from "@/db/schema";
import type { SourceItemInput } from "@/lib/sources/types";

export type WatchlistItem = typeof watchlistItems.$inferSelect;
export type SignalScore = typeof signalScores.$inferSelect;
export type MacroEvent = typeof macroEvents.$inferSelect;
export type AlertRecord = typeof alerts.$inferSelect;
export type JobRun = typeof jobRuns.$inferSelect;
export type SignalFeedback = typeof signalFeedback.$inferSelect;

export type SignalWithEvent = SignalScore & {
  event: MacroEvent;
};

export type SignalRecordInput = {
  event: {
    fingerprint: string;
    sourceItemContentHash?: string | null;
    eventType: string;
    title: string;
    summary: string;
    eventDate?: Date | null;
    impactHorizon: string;
    citations: Citation[];
    rawModelJson: Record<string, unknown>;
  };
  score: {
    score: number;
    rankingLabel: string;
    reason: string;
    directionalSuggestion: string;
    breakdown: ScoreBreakdown;
    affectedSymbols: AffectedSymbol[];
  };
};

export function requireDatabase() {
  return getDb();
}

export function databaseStatus() {
  return { configured: isDatabaseConfigured() };
}

export async function listWatchlistItems(activeOnly = true): Promise<WatchlistItem[]> {
  const db = requireDatabase();
  return db
    .select()
    .from(watchlistItems)
    .where(activeOnly ? eq(watchlistItems.active, true) : undefined)
    .orderBy(watchlistItems.symbol);
}

export async function upsertWatchlistItem(input: {
  symbol: string;
  name?: string | null;
  sector?: string | null;
  portfolioWeight?: number | null;
  notes?: string | null;
}) {
  const db = requireDatabase();
  const symbol = input.symbol.trim().toUpperCase();
  const [item] = await db
    .insert(watchlistItems)
    .values({
      symbol,
      name: input.name?.trim() || null,
      sector: input.sector?.trim() || null,
      portfolioWeight: input.portfolioWeight ?? null,
      notes: input.notes?.trim() || null,
      active: true,
      updatedAt: new Date()
    })
    .onConflictDoUpdate({
      target: watchlistItems.symbol,
      set: {
        name: input.name?.trim() || null,
        sector: input.sector?.trim() || null,
        portfolioWeight: input.portfolioWeight ?? null,
        notes: input.notes?.trim() || null,
        active: true,
        updatedAt: new Date()
      }
    })
    .returning();
  return item;
}

export async function deactivateWatchlistItem(id: string) {
  const db = requireDatabase();
  await db
    .update(watchlistItems)
    .set({ active: false, updatedAt: new Date() })
    .where(eq(watchlistItems.id, id));
}

export async function upsertSourceItems(items: SourceItemInput[]) {
  if (items.length === 0) return [];
  const db = requireDatabase();
  const rows = [];

  for (const item of items) {
    const [row] = await db
      .insert(sourceItems)
      .values({
        sourceType: item.sourceType,
        sourceName: item.sourceName,
        externalId: item.externalId,
        title: item.title,
        url: item.url ?? null,
        publishedAt: item.publishedAt ?? null,
        contentHash: item.contentHash,
        summary: item.summary ?? null,
        rawJson: item.rawJson ?? {}
      })
      .onConflictDoUpdate({
        target: sourceItems.contentHash,
        set: {
          title: item.title,
          url: item.url ?? null,
          publishedAt: item.publishedAt ?? null,
          summary: item.summary ?? null,
          rawJson: item.rawJson ?? {}
        }
      })
      .returning();
    rows.push(row);
  }

  return rows;
}

export async function startJobRun(input: {
  jobType: string;
  runKey: string;
  force?: boolean;
  lockMinutes?: number;
}): Promise<{ acquired: boolean; run: JobRun | null; reason?: string }> {
  const db = requireDatabase();
  const existing = await db.query.jobRuns.findFirst({
    where: eq(jobRuns.runKey, input.runKey)
  });

  const now = new Date();
  if (existing && !input.force) {
    if (existing.status === "completed") {
      return { acquired: false, run: existing, reason: "already_completed" };
    }
    if (existing.status === "running" && existing.lockExpiresAt > now) {
      return { acquired: false, run: existing, reason: "already_running" };
    }
  }

  const lockExpiresAt = new Date(now.getTime() + (input.lockMinutes ?? 15) * 60_000);
  const runKey = input.force ? `${input.runKey}:manual:${now.toISOString()}` : input.runKey;
  const [run] = await db
    .insert(jobRuns)
    .values({
      jobType: input.jobType,
      runKey,
      status: "running",
      startedAt: now,
      lockExpiresAt,
      details: { forced: Boolean(input.force) }
    })
    .onConflictDoNothing()
    .returning();

  if (!run) {
    const race = await db.query.jobRuns.findFirst({ where: eq(jobRuns.runKey, runKey) });
    return { acquired: false, run: race ?? null, reason: "conflict" };
  }

  return { acquired: true, run };
}

export async function finishJobRun(
  id: string,
  status: "completed" | "failed" | "skipped",
  details: Record<string, unknown>,
  error?: string
) {
  const db = requireDatabase();
  const [run] = await db
    .update(jobRuns)
    .set({ status, details, error: error ?? null, finishedAt: new Date() })
    .where(eq(jobRuns.id, id))
    .returning();
  return run;
}

export async function saveSignalRecords(records: SignalRecordInput[]) {
  if (records.length === 0) return [];
  const db = requireDatabase();
  const sourceRows = await db.select().from(sourceItems);
  const sourceByHash = new Map(sourceRows.map((item) => [item.contentHash, item.id]));
  const saved: SignalWithEvent[] = [];

  for (const record of records) {
    const sourceItemId = record.event.sourceItemContentHash
      ? sourceByHash.get(record.event.sourceItemContentHash) ?? null
      : null;

    const [event] = await db
      .insert(macroEvents)
      .values({
        sourceItemId,
        fingerprint: record.event.fingerprint,
        eventType: record.event.eventType,
        title: record.event.title,
        summary: record.event.summary,
        eventDate: record.event.eventDate ?? null,
        impactHorizon: record.event.impactHorizon,
        citations: record.event.citations,
        rawModelJson: record.event.rawModelJson,
        detectedAt: new Date(),
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: macroEvents.fingerprint,
        set: {
          sourceItemId,
          eventType: record.event.eventType,
          title: record.event.title,
          summary: record.event.summary,
          eventDate: record.event.eventDate ?? null,
          impactHorizon: record.event.impactHorizon,
          citations: record.event.citations,
          rawModelJson: record.event.rawModelJson,
          detectedAt: new Date(),
          updatedAt: new Date()
        }
      })
      .returning();

    const [score] = await db
      .insert(signalScores)
      .values({
        eventId: event.id,
        score: record.score.score,
        rankingLabel: record.score.rankingLabel,
        reason: record.score.reason,
        directionalSuggestion: record.score.directionalSuggestion,
        breakdown: record.score.breakdown,
        affectedSymbols: record.score.affectedSymbols
      })
      .onConflictDoUpdate({
        target: signalScores.eventId,
        set: {
          score: record.score.score,
          rankingLabel: record.score.rankingLabel,
          reason: record.score.reason,
          directionalSuggestion: record.score.directionalSuggestion,
          breakdown: record.score.breakdown,
          affectedSymbols: record.score.affectedSymbols,
          createdAt: new Date()
        }
      })
      .returning();

    saved.push({ ...score, event });
  }

  return saved;
}

export async function listSignals(minScore = 75, limit = 50): Promise<SignalWithEvent[]> {
  const db = requireDatabase();
  const rows = await db
    .select()
    .from(signalScores)
    .innerJoin(macroEvents, eq(signalScores.eventId, macroEvents.id))
    .where(gte(signalScores.score, minScore))
    .orderBy(desc(signalScores.score), desc(signalScores.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    ...row.signal_scores,
    event: row.macro_events
  }));
}

export async function getSignal(id: string): Promise<SignalWithEvent | null> {
  const db = requireDatabase();
  const rows = await db
    .select()
    .from(signalScores)
    .innerJoin(macroEvents, eq(signalScores.eventId, macroEvents.id))
    .where(eq(signalScores.id, id))
    .limit(1);
  const row = rows[0];
  return row ? { ...row.signal_scores, event: row.macro_events } : null;
}

export async function listUpcomingEvents(daysAhead = 45): Promise<MacroEvent[]> {
  const db = requireDatabase();
  const now = new Date();
  const through = new Date(now.getTime() + daysAhead * 24 * 60 * 60_000);
  return db
    .select()
    .from(macroEvents)
    .where(and(gte(macroEvents.eventDate, now), sql`${macroEvents.eventDate} <= ${through}`))
    .orderBy(macroEvents.eventDate);
}

export async function listRecentJobRuns(limit = 10): Promise<JobRun[]> {
  const db = requireDatabase();
  return db.select().from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(limit);
}

export async function saveSignalFeedback(input: {
  signalScoreId: string;
  rating: "useful" | "noise" | "not_relevant";
  notes?: string | null;
}) {
  const db = requireDatabase();
  const [feedback] = await db
    .insert(signalFeedback)
    .values({
      signalScoreId: input.signalScoreId,
      rating: input.rating,
      notes: input.notes?.trim() || null,
      updatedAt: new Date()
    })
    .onConflictDoUpdate({
      target: signalFeedback.signalScoreId,
      set: {
        rating: input.rating,
        notes: input.notes?.trim() || null,
        updatedAt: new Date()
      }
    })
    .returning();
  return feedback;
}

export async function getSignalFeedback(signalScoreId: string): Promise<SignalFeedback | null> {
  const db = requireDatabase();
  const rows = await db
    .select()
    .from(signalFeedback)
    .where(eq(signalFeedback.signalScoreId, signalScoreId))
    .limit(1);
  return rows[0] ?? null;
}

export async function createPendingAlertsForSignals(signals: SignalWithEvent[], threshold = 80) {
  const db = requireDatabase();
  const highSignalIds = signals.filter((signal) => signal.score >= threshold).map((signal) => signal.eventId);
  if (highSignalIds.length === 0) return [];

  const pending = [];
  for (const eventId of highSignalIds) {
    const [alert] = await db
      .insert(alerts)
      .values({
        eventId,
        channel: "email",
        threshold,
        status: "pending"
      })
      .onConflictDoNothing()
      .returning();
    if (alert) pending.push(alert);
  }

  return pending;
}

export async function listPendingAlerts(): Promise<(AlertRecord & { event: MacroEvent; score: SignalScore })[]> {
  const db = requireDatabase();
  const rows = await db
    .select()
    .from(alerts)
    .innerJoin(macroEvents, eq(alerts.eventId, macroEvents.id))
    .innerJoin(signalScores, eq(signalScores.eventId, macroEvents.id))
    .where(eq(alerts.status, "pending"))
    .orderBy(desc(signalScores.score));

  return rows.map((row) => ({
    ...row.alerts,
    event: row.macro_events,
    score: row.signal_scores
  }));
}

export async function markAlerts(ids: string[], status: "sent" | "skipped" | "failed", error?: string) {
  if (ids.length === 0) return;
  const db = requireDatabase();
  await db
    .update(alerts)
    .set({
      status,
      error: error ?? null,
      sentAt: status === "sent" ? new Date() : null
    })
    .where(inArray(alerts.id, ids));
}

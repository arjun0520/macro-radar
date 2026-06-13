import "server-only";

import { ensureDatabaseMigrated } from "@/db/migrate";
import {
  createPendingAlertsForSignals,
  finishJobRun,
  listPendingAlerts,
  listWatchlistItems,
  markAlerts,
  upsertEconomicCalendarEvents,
  saveSignalRecords,
  startJobRun,
  upsertSourceItems
} from "@/db/repository";
import { extractAndScoreSignals } from "@/lib/llm/openai";
import { sendSignalEmail } from "@/lib/notifications/email";
import { collectAllSources } from "@/lib/sources";

export type DailyDigestResult = {
  status: "completed" | "skipped" | "failed";
  runId?: string;
  details: Record<string, unknown>;
};

export async function runDailyDigest({ force = false }: { force?: boolean } = {}): Promise<DailyDigestResult> {
  const stepTimings: StepTiming[] = [];
  try {
    await recordStep(stepTimings, "auto_migration", () => ensureDatabaseMigrated());
  } catch (error) {
    return {
      status: "failed",
      details: {
        error: `Automatic database migration failed: ${error instanceof Error ? error.message : "unknown error"}`,
        stepTimings
      }
    };
  }

  const dateKey = new Date().toISOString().slice(0, 10);
  const started = await startJobRun({
    jobType: "daily-digest",
    runKey: `daily-digest:${dateKey}`,
    force,
    lockMinutes: 20
  });

  if (!started.acquired || !started.run) {
    return {
      status: "skipped",
      runId: started.run?.id,
      details: { reason: started.reason ?? "not_acquired" }
    };
  }

  try {
    const watchlist = await recordStep(stepTimings, "load_watchlist", () => listWatchlistItems(true));
    const sourceResult = await recordStep(stepTimings, "collect_sources", () => collectAllSources(watchlist));
    const sourceRows = await recordStep(stepTimings, "store_source_items", () => upsertSourceItems(sourceResult.items));
    const calendarRows = await recordStep(stepTimings, "store_calendar_events", () =>
      upsertEconomicCalendarEvents(sourceResult.calendarEvents ?? [])
    );
    const llmResult = await recordStep(stepTimings, "extract_and_rank_signals", () =>
      extractAndScoreSignals(sourceResult.items, watchlist)
    );
    const savedSignals = await recordStep(stepTimings, "store_signals", () => saveSignalRecords(llmResult.records));
    const pendingAlerts = await recordStep(stepTimings, "create_alerts", () => createPendingAlertsForSignals(savedSignals, 80));
    const alertsToSend = await recordStep(stepTimings, "load_pending_alerts", () => listPendingAlerts());
    const emailResult = await recordStep(stepTimings, "send_email_alerts", () => sendSignalEmail(alertsToSend));

    if (emailResult.status === "sent") {
      await recordStep(stepTimings, "mark_sent_alerts", () => markAlerts(
        alertsToSend.map((alert) => alert.id),
        "sent"
      ));
    } else if (emailResult.status === "skipped") {
      await recordStep(stepTimings, "mark_skipped_alerts", () => markAlerts(
        pendingAlerts.map((alert) => alert.id),
        "skipped",
        emailResult.reason
      ));
    }

    const details = {
      watchlistCount: watchlist.length,
      sourceItemCount: sourceResult.items.length,
      storedSourceItemCount: sourceRows.length,
      calendarEventCount: sourceResult.calendarEvents?.length ?? 0,
      storedCalendarEventCount: calendarRows.length,
      signalCount: savedSignals.length,
      pendingAlertCount: pendingAlerts.length,
      emailStatus: emailResult.status,
      usedFallback: llmResult.usedFallback,
      llm: llmResult.diagnostics,
      stepTimings,
      sourceBreakdown: sourceResult.stats ?? [],
      warnings: [...sourceResult.warnings, ...llmResult.warnings]
    };
    await finishJobRun(started.run.id, "completed", details);
    return { status: "completed", runId: started.run.id, details };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const details = { failedAt: new Date().toISOString(), stepTimings };
    await finishJobRun(started.run.id, "failed", details, message);
    return { status: "failed", runId: started.run.id, details: { ...details, error: message } };
  }
}

type StepTiming = {
  step: string;
  status: "ok" | "failed";
  durationMs: number;
  error?: string;
};

async function recordStep<T>(stepTimings: StepTiming[], step: string, action: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await action();
    stepTimings.push({ step, status: "ok", durationMs: Date.now() - startedAt });
    return result;
  } catch (error) {
    stepTimings.push({
      step,
      status: "failed",
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "unknown error"
    });
    throw error;
  }
}

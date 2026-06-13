import "server-only";

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
    const watchlist = await listWatchlistItems(true);
    const sourceResult = await collectAllSources(watchlist);
    const sourceRows = await upsertSourceItems(sourceResult.items);
    const calendarRows = await upsertEconomicCalendarEvents(sourceResult.calendarEvents ?? []);
    const llmResult = await extractAndScoreSignals(sourceResult.items, watchlist);
    const savedSignals = await saveSignalRecords(llmResult.records);
    const pendingAlerts = await createPendingAlertsForSignals(savedSignals, 80);
    const alertsToSend = await listPendingAlerts();
    const emailResult = await sendSignalEmail(alertsToSend);

    if (emailResult.status === "sent") {
      await markAlerts(
        alertsToSend.map((alert) => alert.id),
        "sent"
      );
    } else if (emailResult.status === "skipped") {
      await markAlerts(
        pendingAlerts.map((alert) => alert.id),
        "skipped",
        emailResult.reason
      );
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
      sourceBreakdown: sourceResult.stats ?? [],
      warnings: [...sourceResult.warnings, ...llmResult.warnings]
    };
    await finishJobRun(started.run.id, "completed", details);
    return { status: "completed", runId: started.run.id, details };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    await finishJobRun(started.run.id, "failed", { failedAt: new Date().toISOString() }, message);
    return { status: "failed", runId: started.run.id, details: { error: message } };
  }
}

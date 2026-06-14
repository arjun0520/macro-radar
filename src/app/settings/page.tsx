import { CheckCircle2, CircleAlert } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { RunDigestButton } from "@/components/RunDigestButton";
import { listRecentJobRuns } from "@/db/repository";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireUser();
  let jobs: Awaited<ReturnType<typeof listRecentJobRuns>> = [];
  let dbError: string | null = null;
  try {
    jobs = await listRecentJobRuns(8);
  } catch (error) {
    dbError = error instanceof Error ? error.message : "Database unavailable.";
  }

  const checks = [
    ["Database", Boolean(process.env.DATABASE_URL), dbError ?? "Neon/Postgres connection string"],
    ["OpenAI", Boolean(process.env.OPENAI_API_KEY), "Responses API extraction and ranking"],
    ["Cron secret", Boolean(process.env.CRON_SECRET), "Protects scheduled digest endpoint"],
    ["FRED", Boolean(process.env.FRED_API_KEY), "Optional release calendar"],
    ["BEA", Boolean(process.env.BEA_API_KEY), "Optional free GDP data"],
    ["EIA", Boolean(process.env.EIA_API_KEY), "Optional free energy inventory data"],
    ["Census", Boolean(process.env.CENSUS_API_KEY), "Optional free retail-sales data"],
    ["Trading Economics", Boolean(process.env.TRADING_ECONOMICS_API_KEY), "Optional consensus economic calendar"],
    ["FMP", Boolean(process.env.FMP_API_KEY ?? process.env.FINANCIAL_MODELING_PREP_API_KEY), "Optional fallback economic calendar"],
    ["Finnhub", Boolean(process.env.FINNHUB_API_KEY), "Optional earnings calendar"],
    ["Email", Boolean(process.env.SMTP_HOST && process.env.ALERT_EMAIL_TO), "Optional SMTP alerts"]
  ] as const;

  return (
    <main className="mobile-shell">
      <AppHeader eyebrow="Control" title="Settings" />
      <div className="space-y-5">
        <RunDigestButton />

        <section className="glass-card rounded-[30px] p-5">
          <p className="text-sm font-black">Environment</p>
          <div className="mt-4 space-y-3">
            {checks.map(([label, ok, detail]) => (
              <div key={label} className="flex items-center justify-between gap-3 rounded-2xl bg-white/70 p-3">
                <div>
                  <p className="font-bold">{label}</p>
                  <p className="text-xs text-ink/50">{detail}</p>
                </div>
                {ok ? <CheckCircle2 className="text-mint" /> : <CircleAlert className="text-warning" />}
              </div>
            ))}
          </div>
        </section>

        <section className="glass-card rounded-[30px] p-5">
          <p className="text-sm font-black">Recent job runs</p>
          <div className="mt-3 space-y-3">
            {jobs.length > 0 ? (
              jobs.map((job) => {
                const details = job.details as {
                  sourceItemCount?: number;
                  calendarEventCount?: number;
                  signalCount?: number;
                  pendingAlertCount?: number;
                  usedFallback?: boolean;
                  llm?: {
                    enabled?: boolean;
                    requestedModel?: string;
                    sanitizedModel?: string;
                    extractionModel?: string;
                    rankingModel?: string;
                    modelSanitized?: boolean;
                    fallbackModel?: string;
                    fallbackModelUsed?: boolean;
                    tokenUsage?: TokenUsageDetails;
                    finalSignalCount?: number;
                    selectedSignalCount?: number;
                    phases?: Array<{
                      phase: string;
                      model: string;
                      ok: boolean;
                      status?: number;
                      durationMs?: number;
                      inputCount?: number;
                      outputCount?: number;
                      tokenUsage?: TokenUsageDetails;
                      errorCode?: string;
                      errorMessage?: string;
                    }>;
                  };
                  stepTimings?: Array<{
                    step: string;
                    status: string;
                    durationMs: number;
                    error?: string;
                  }>;
                  sourceBreakdown?: Array<{
                    sourceName: string;
                    sourceType: string;
                    itemCount: number;
                    calendarEventCount?: number;
                  }>;
                  warnings?: string[];
                };
                return (
                  <div key={job.id} className="rounded-2xl bg-white/70 p-3">
                    <p className="font-bold">
                      {job.status} · {job.startedAt.toLocaleString()}
                    </p>
                    <p className="mt-1 text-xs text-ink/50">
                      Sources: {details.sourceItemCount ?? 0} · Calendar: {details.calendarEventCount ?? 0} · Signals:{" "}
                      {details.signalCount ?? 0} · Alerts:{" "}
                      {details.pendingAlertCount ?? 0} {details.usedFallback ? "· fallback ranking" : ""}
                    </p>
                    {details.sourceBreakdown?.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {details.sourceBreakdown.slice(0, 8).map((source) => (
                          <span
                            key={`${job.id}-${source.sourceType}-${source.sourceName}`}
                            className="rounded-full bg-limewash px-3 py-1 text-[11px] font-bold text-forest"
                          >
                            {source.sourceName}: {source.itemCount + (source.calendarEventCount ?? 0)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {details.llm ? (
                      <div className="mt-3 rounded-2xl bg-ink/5 p-3">
                        <p className="text-xs font-black text-ink">LLM diagnostics</p>
                        <p className="mt-1 text-xs text-ink/60">{formatLlmSummary(details.llm)}</p>
                        {details.llm.modelSanitized ? (
                          <p className="mt-1 text-xs text-warning">
                            Model env sanitized from {details.llm.requestedModel} to {details.llm.sanitizedModel}.
                          </p>
                        ) : null}
                        {details.llm.phases?.length ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {details.llm.phases.map((phase, index) => (
                              <span
                                key={`${job.id}-${phase.phase}-${phase.model}-${index}`}
                                className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                                  phase.ok ? "bg-limewash text-forest" : "bg-warning/10 text-warning"
                                }`}
                                title={phase.errorMessage}
                              >
                                {phase.phase}: {phase.ok ? "ok" : phase.errorCode ?? "failed"} · {phase.durationMs ?? 0}ms
                                {phase.tokenUsage?.totalTokens ? ` · ${formatNumber(phase.tokenUsage.totalTokens)} tok` : ""}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {details.stepTimings?.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {details.stepTimings.slice(0, 10).map((step, index) => (
                          <span
                            key={`${job.id}-${step.step}-${index}`}
                            className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                              step.status === "ok" ? "bg-white text-ink/60" : "bg-danger/10 text-danger"
                            }`}
                            title={step.error}
                          >
                            {humanizeStep(step.step)} · {step.durationMs}ms
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {details.warnings?.length ? (
                      <div className="mt-3 space-y-1">
                        {details.warnings.slice(0, 5).map((warning) => (
                          <p key={warning} className="text-xs text-warning">
                            {warning}
                          </p>
                        ))}
                      </div>
                    ) : null}
                    {job.error ? <p className="mt-1 text-xs text-danger">{job.error}</p> : null}
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-ink/60">No runs yet.</p>
            )}
          </div>
        </section>

        <section className="rounded-[26px] border border-ink/10 bg-white/50 p-4 text-xs leading-5 text-ink/50">
          Signals are ranked for days-to-weeks decisions. The app intentionally avoids exact order instructions and
          auto-trading.
        </section>
      </div>
      <BottomNav />
    </main>
  );
}

function formatLlmSummary(llm: {
  enabled?: boolean;
  sanitizedModel?: string;
  extractionModel?: string;
  rankingModel?: string;
  fallbackModel?: string;
  fallbackModelUsed?: boolean;
  tokenUsage?: TokenUsageDetails;
  finalSignalCount?: number;
  selectedSignalCount?: number;
  phases?: Array<{ ok: boolean }>;
}): string {
  if (!llm.enabled) return "disabled; deterministic fallback used";
  const phases = llm.phases ?? [];
  const okCount = phases.filter((phase) => phase.ok).length;
  const phaseText = phases.length ? `${okCount}/${phases.length} phases ok` : "not called";
  const modelText = formatModelText(llm);
  const fallbackText = llm.fallbackModelUsed ? ` · fallback model used${llm.fallbackModel ? ` (${llm.fallbackModel})` : ""}` : "";
  const tokenText = llm.tokenUsage?.totalTokens ? ` · ${formatNumber(llm.tokenUsage.totalTokens)} tokens` : "";
  const signalText =
    llm.selectedSignalCount == null
      ? ""
      : ` · selected ${llm.selectedSignalCount}${llm.finalSignalCount == null ? "" : ` of ${llm.finalSignalCount}`}`;
  return `${modelText} · ${phaseText}${fallbackText}${tokenText}${signalText}`;
}

type TokenUsageDetails = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  reasoningOutputTokens?: number;
};

function formatModelText(llm: { sanitizedModel?: string; extractionModel?: string; rankingModel?: string }): string {
  if (llm.extractionModel && llm.rankingModel && llm.extractionModel !== llm.rankingModel) {
    return `extract ${llm.extractionModel} · rank ${llm.rankingModel}`;
  }
  return llm.sanitizedModel ?? llm.extractionModel ?? llm.rankingModel ?? "model unset";
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

function humanizeStep(step: string): string {
  return step.replace(/_/g, " ");
}

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
    ["OpenAI", Boolean(process.env.OPENAI_API_KEY), "Responses API with web search"],
    ["Cron secret", Boolean(process.env.CRON_SECRET), "Protects scheduled digest endpoint"],
    ["FRED", Boolean(process.env.FRED_API_KEY), "Optional release calendar"],
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
                  signalCount?: number;
                  pendingAlertCount?: number;
                  usedFallback?: boolean;
                  sourceBreakdown?: Array<{ sourceName: string; sourceType: string; itemCount: number }>;
                  warnings?: string[];
                };
                return (
                  <div key={job.id} className="rounded-2xl bg-white/70 p-3">
                    <p className="font-bold">
                      {job.status} · {job.startedAt.toLocaleString()}
                    </p>
                    <p className="mt-1 text-xs text-ink/50">
                      Sources: {details.sourceItemCount ?? 0} · Signals: {details.signalCount ?? 0} · Alerts:{" "}
                      {details.pendingAlertCount ?? 0} {details.usedFallback ? "· fallback ranking" : ""}
                    </p>
                    {details.sourceBreakdown?.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {details.sourceBreakdown.slice(0, 8).map((source) => (
                          <span
                            key={`${job.id}-${source.sourceType}-${source.sourceName}`}
                            className="rounded-full bg-limewash px-3 py-1 text-[11px] font-bold text-forest"
                          >
                            {source.sourceName}: {source.itemCount}
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

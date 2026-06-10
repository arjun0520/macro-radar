import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { MetricPill } from "@/components/MetricPill";
import { RunDigestButton } from "@/components/RunDigestButton";
import { SetupNotice } from "@/components/SetupNotice";
import { SignalCard } from "@/components/SignalCard";
import { listRecentJobRuns, listSignals, listUpcomingEvents, listWatchlistItems } from "@/db/repository";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  await requireUser();
  let data:
    | {
        signals: Awaited<ReturnType<typeof listSignals>>;
        watchlist: Awaited<ReturnType<typeof listWatchlistItems>>;
        events: Awaited<ReturnType<typeof listUpcomingEvents>>;
        jobs: Awaited<ReturnType<typeof listRecentJobRuns>>;
      }
    | null = null;
  let error: string | null = null;

  try {
    const [signals, watchlist, events, jobs] = await Promise.all([
      listSignals(75, 20),
      listWatchlistItems(true),
      listUpcomingEvents(30),
      listRecentJobRuns(5)
    ]);
    data = { signals, watchlist, events, jobs };
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Unable to load dashboard.";
  }

  const latestJob = data?.jobs[0];

  return (
    <main className="mobile-shell">
      <AppHeader eyebrow="Today" title="Macro Radar" />
      {error ? <SetupNotice message={error} /> : null}

      {data ? (
        <div className="space-y-5">
          <section className="grid grid-cols-3 gap-3">
            <MetricPill label="Signals" value={data.signals.length} />
            <MetricPill label="Watchlist" value={data.watchlist.length} />
            <MetricPill label="Events" value={data.events.length} />
          </section>

          <RunDigestButton />

          <section className="glass-card rounded-[30px] p-5">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink/45">Last run</p>
            <p className="mt-2 text-sm font-bold text-ink">
              {latestJob ? `${latestJob.status} · ${latestJob.startedAt.toLocaleString()}` : "No digest runs yet"}
            </p>
            {latestJob?.error ? <p className="mt-2 text-xs text-danger">{latestJob.error}</p> : null}
          </section>

          <section>
            <div className="mb-3 flex items-end justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-mint">High precision</p>
                <h2 className="text-2xl font-black tracking-[-0.05em]">Focus list</h2>
              </div>
              <p className="text-xs font-bold text-ink/45">Score ≥ 75</p>
            </div>
            <div className="space-y-4">
              {data.signals.length > 0 ? (
                data.signals.map((signal) => <SignalCard key={signal.id} signal={signal} />)
              ) : (
                <div className="glass-card rounded-[30px] p-5 text-sm leading-6 text-ink/65">
                  No high-signal events yet. Add watchlist symbols, configure source keys, then run the digest.
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}
      <BottomNav />
    </main>
  );
}

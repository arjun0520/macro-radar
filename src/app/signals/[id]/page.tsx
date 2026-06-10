import Link from "next/link";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { getSignal } from "@/db/repository";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function SignalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const signal = await getSignal(id);
  if (!signal) notFound();

  return (
    <main className="mobile-shell">
      <AppHeader eyebrow="Signal detail" title={`${signal.score}/100`} />
      <section className="glass-card rounded-[34px] p-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-mint">{signal.event.eventType}</p>
        <h1 className="mt-2 text-3xl font-black leading-8 tracking-[-0.06em]">{signal.event.title}</h1>
        <p className="mt-4 text-base leading-7 text-ink/68">{signal.event.summary}</p>
        <div className="mt-5 rounded-3xl bg-limewash p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-forest/55">Directional suggestion</p>
          <p className="mt-2 text-sm font-bold leading-6 text-forest">{signal.directionalSuggestion}</p>
        </div>
        <p className="mt-4 text-sm leading-6 text-ink/65">{signal.reason}</p>
      </section>

      <section className="mt-5 grid grid-cols-2 gap-3">
        {Object.entries(signal.breakdown).map(([label, value]) => (
          <div key={label} className="rounded-3xl border border-ink/10 bg-white/75 p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink/40">
              {label.replace(/([A-Z])/g, " $1")}
            </p>
            <p className="mt-1 text-2xl font-black">{value}</p>
          </div>
        ))}
      </section>

      {signal.affectedSymbols.length > 0 ? (
        <section className="mt-5 glass-card rounded-[30px] p-5">
          <p className="text-sm font-black">Affected holdings</p>
          <div className="mt-3 space-y-3">
            {signal.affectedSymbols.map((item) => (
              <div key={item.symbol} className="rounded-2xl bg-white/70 p-3">
                <p className="font-black">{item.symbol}</p>
                <p className="text-sm text-ink/60">{item.rationale}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-5 glass-card rounded-[30px] p-5">
        <p className="text-sm font-black">Sources</p>
        <div className="mt-3 space-y-3">
          {signal.event.citations.length > 0 ? (
            signal.event.citations.map((citation) => (
              <Link
                key={`${citation.url}-${citation.title}`}
                href={citation.url}
                target="_blank"
                className="block rounded-2xl bg-white/70 p-3 text-sm font-bold text-forest"
              >
                {citation.title}
                <span className="mt-1 block text-xs font-semibold text-ink/45">{citation.source}</span>
              </Link>
            ))
          ) : (
            <p className="text-sm text-ink/60">No citation captured.</p>
          )}
        </div>
      </section>

      <section className="mt-5 rounded-[26px] border border-ink/10 bg-white/50 p-4 text-xs leading-5 text-ink/50">
        Macro Radar is decision support only. It does not provide financial advice, execute trades, or replace your own
        investment judgment.
      </section>
      <BottomNav />
    </main>
  );
}

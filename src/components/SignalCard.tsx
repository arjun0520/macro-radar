import { ArrowRight, ShieldAlert } from "lucide-react";
import Link from "next/link";

import type { SignalWithEvent } from "@/db/repository";

export function SignalCard({ signal }: { signal: SignalWithEvent }) {
  return (
    <Link href={`/signals/${signal.id}`} className="glass-card block rounded-[30px] p-5 transition active:scale-[0.99]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-forest/50">{signal.event.eventType}</p>
          <h2 className="mt-2 text-xl font-black leading-6 tracking-[-0.04em] text-ink">{signal.event.title}</h2>
        </div>
        <div className="rounded-2xl bg-mint px-3 py-2 text-center text-sm font-black text-forest">
          {signal.score}
        </div>
      </div>
      <p className="mt-3 line-clamp-3 text-sm leading-6 text-ink/66">{signal.event.summary}</p>
      <div className="mt-4 flex items-center justify-between border-t border-ink/10 pt-4">
        <span className="inline-flex items-center gap-2 text-xs font-bold text-forest/70">
          <ShieldAlert size={15} /> {signal.rankingLabel.toUpperCase()} signal
        </span>
        <ArrowRight size={18} className="text-ink/40" />
      </div>
    </Link>
  );
}

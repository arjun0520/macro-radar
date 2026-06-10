import { Plus, Trash2 } from "lucide-react";

import { addWatchlistItemAction, removeWatchlistItemAction } from "@/app/actions";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { SetupNotice } from "@/components/SetupNotice";
import { listWatchlistItems } from "@/db/repository";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function WatchlistPage() {
  await requireUser();
  let items: Awaited<ReturnType<typeof listWatchlistItems>> = [];
  let error: string | null = null;
  try {
    items = await listWatchlistItems(false);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Unable to load watchlist.";
  }

  return (
    <main className="mobile-shell">
      <AppHeader eyebrow="Portfolio" title="Watchlist" />
      {error ? <SetupNotice message={error} /> : null}
      <section className="glass-card rounded-[30px] p-5">
        <form action={addWatchlistItemAction} className="space-y-3">
          <div className="grid grid-cols-[1fr_1fr] gap-3">
            <input name="symbol" placeholder="AAPL" className="rounded-2xl border border-ink/10 bg-white px-4 py-3" required />
            <input name="portfolioWeight" placeholder="Weight %" className="rounded-2xl border border-ink/10 bg-white px-4 py-3" />
          </div>
          <input name="name" placeholder="Name (optional)" className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3" />
          <input name="sector" placeholder="Sector/theme (optional)" className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3" />
          <textarea
            name="notes"
            placeholder="Why you own it, risks, or thesis notes"
            className="min-h-24 w-full rounded-2xl border border-ink/10 bg-white px-4 py-3"
          />
          <button className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-ink px-5 py-4 font-black text-white">
            <Plus size={18} /> Add or update
          </button>
        </form>
      </section>

      <section className="mt-5 space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className={`glass-card flex items-center justify-between gap-4 rounded-[26px] p-4 ${item.active ? "" : "opacity-50"}`}
          >
            <div>
              <p className="text-lg font-black">{item.symbol}</p>
              <p className="text-sm text-ink/55">
                {item.name || item.sector || "US stock/ETF"}{" "}
                {item.portfolioWeight == null ? "" : `· ${(item.portfolioWeight * 100).toFixed(1)}%`}
              </p>
            </div>
            {item.active ? (
              <form action={removeWatchlistItemAction}>
                <input type="hidden" name="id" value={item.id} />
                <button className="grid size-11 place-items-center rounded-full bg-white text-danger">
                  <Trash2 size={18} />
                </button>
              </form>
            ) : (
              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-ink/40">Inactive</span>
            )}
          </div>
        ))}
      </section>
      <BottomNav />
    </main>
  );
}

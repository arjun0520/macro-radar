import { Radar } from "lucide-react";

import { loginAction } from "@/app/login/actions";

export default async function LoginPage({
  searchParams
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const params = searchParams ? await searchParams : {};

  return (
    <main className="mobile-shell flex items-center">
      <section className="glass-card w-full rounded-[36px] p-6">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-ink text-mint">
            <Radar size={25} />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-mint">Private beta</p>
            <h1 className="text-3xl font-black tracking-[-0.06em]">Macro Radar</h1>
          </div>
        </div>
        <p className="mb-6 text-sm leading-6 text-ink/65">
          High-precision macro, earnings, and filing signals for your watchlist. Decision support only.
        </p>
        <form action={loginAction} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-ink/50">Password</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-4 text-base outline-none focus:border-mint"
              required
            />
          </label>
          {params.error ? <p className="text-sm font-semibold text-danger">{params.error}</p> : null}
          <button className="w-full rounded-2xl bg-ink px-5 py-4 text-base font-black text-white">Enter</button>
        </form>
      </section>
    </main>
  );
}

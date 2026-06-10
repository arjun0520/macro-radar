import { logoutAction } from "@/app/actions";

export function AppHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <header className="mb-5 flex items-start justify-between gap-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-mint">{eyebrow}</p>
        <h1 className="mt-1 text-3xl font-black tracking-[-0.06em] text-ink">{title}</h1>
      </div>
      <form action={logoutAction}>
        <button className="rounded-full border border-ink/10 bg-white/70 px-3 py-2 text-xs font-bold text-ink/70">
          Log out
        </button>
      </form>
    </header>
  );
}

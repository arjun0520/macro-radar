export function MetricPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-3xl border border-ink/10 bg-white/70 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-ink/45">{label}</p>
      <p className="mt-1 text-2xl font-black tracking-[-0.04em]">{value}</p>
    </div>
  );
}

export function SetupNotice({ message }: { message?: string }) {
  return (
    <section className="rounded-[30px] border border-warning/30 bg-[#fff7e6] p-5 text-ink">
      <p className="text-sm font-black">Setup required</p>
      <p className="mt-2 text-sm leading-6 text-ink/70">
        {message ?? "Configure DATABASE_URL and run the Drizzle migration before using live data."}
      </p>
    </section>
  );
}

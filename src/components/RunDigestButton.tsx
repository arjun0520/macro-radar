"use client";

import { RefreshCcw } from "lucide-react";
import { useState } from "react";

export function RunDigestButton() {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function runDigest() {
    setState("running");
    setMessage(null);
    try {
      const response = await fetch("/api/jobs/daily-digest?force=1", { method: "POST" });
      const payload = (await response.json()) as { status?: string; details?: Record<string, unknown>; error?: string };
      if (!response.ok) throw new Error(payload.error ?? `Request failed ${response.status}`);
      setState("done");
      setMessage(
        `Stored ${String(payload.details?.signalCount ?? 0)} signals from ${String(payload.details?.sourceItemCount ?? 0)} source items.`
      );
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Digest failed.");
    }
  }

  return (
    <div className="glass-card rounded-[28px] p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-black text-ink">Daily digest</p>
          <p className="mt-1 text-xs leading-5 text-ink/60">Manual run uses the same pipeline as Vercel Cron.</p>
        </div>
        <button
          onClick={runDigest}
          disabled={state === "running"}
          className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-3 text-sm font-black text-white disabled:opacity-60"
        >
          <RefreshCcw size={16} className={state === "running" ? "animate-spin" : ""} />
          {state === "running" ? "Running" : "Run now"}
        </button>
      </div>
      {message ? (
        <p className={`mt-3 text-xs ${state === "error" ? "text-danger" : "text-forest/70"}`}>{message}</p>
      ) : null}
    </div>
  );
}

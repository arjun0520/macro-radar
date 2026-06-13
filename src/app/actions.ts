"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { deactivateWatchlistItem, saveSignalFeedback, upsertWatchlistItem } from "@/db/repository";
import { clearSession, requireUser } from "@/lib/auth/session";

const watchlistSchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(1)
    .max(16)
    .regex(/^[A-Za-z.:-]+$/, "Use a valid US ticker symbol."),
  name: z.string().trim().max(120).optional(),
  sector: z.string().trim().max(120).optional(),
  portfolioWeight: z.coerce.number().min(0).max(100).optional(),
  notes: z.string().trim().max(500).optional()
});

export async function addWatchlistItemAction(formData: FormData) {
  await requireUser();
  const parsed = watchlistSchema.parse({
    symbol: formData.get("symbol"),
    name: formData.get("name") || undefined,
    sector: formData.get("sector") || undefined,
    portfolioWeight: formData.get("portfolioWeight") || undefined,
    notes: formData.get("notes") || undefined
  });
  await upsertWatchlistItem({
    ...parsed,
    portfolioWeight: parsed.portfolioWeight == null ? null : parsed.portfolioWeight / 100
  });
  revalidatePath("/");
  revalidatePath("/watchlist");
}

export async function removeWatchlistItemAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (id) await deactivateWatchlistItem(id);
  revalidatePath("/");
  revalidatePath("/watchlist");
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}

export async function saveSignalFeedbackAction(formData: FormData) {
  await requireUser();
  const signalScoreId = String(formData.get("signalScoreId") ?? "");
  const rating = String(formData.get("rating") ?? "");
  if (!signalScoreId || !["useful", "noise", "not_relevant"].includes(rating)) {
    throw new Error("Invalid signal feedback.");
  }

  await saveSignalFeedback({
    signalScoreId,
    rating: rating as "useful" | "noise" | "not_relevant",
    notes: String(formData.get("notes") ?? "")
  });
  revalidatePath(`/signals/${signalScoreId}`);
}

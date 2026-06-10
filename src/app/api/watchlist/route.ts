import { NextResponse } from "next/server";
import { z } from "zod";

import { listWatchlistItems, upsertWatchlistItem } from "@/db/repository";
import { hasValidSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inputSchema = z.object({
  symbol: z.string().min(1).max(16),
  name: z.string().optional().nullable(),
  sector: z.string().optional().nullable(),
  portfolioWeight: z.number().min(0).max(1).optional().nullable(),
  notes: z.string().optional().nullable()
});

export async function GET() {
  if (!(await hasValidSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const items = await listWatchlistItems(false);
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  if (!(await hasValidSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const input = inputSchema.parse(await request.json());
  const item = await upsertWatchlistItem(input);
  return NextResponse.json({ item }, { status: 201 });
}

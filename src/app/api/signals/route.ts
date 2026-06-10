import { NextResponse } from "next/server";

import { listSignals } from "@/db/repository";
import { hasValidSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await hasValidSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const minScore = Number(url.searchParams.get("minScore") ?? 75);
  const limit = Number(url.searchParams.get("limit") ?? 50);
  const signals = await listSignals(Number.isFinite(minScore) ? minScore : 75, Number.isFinite(limit) ? limit : 50);
  return NextResponse.json({ signals });
}

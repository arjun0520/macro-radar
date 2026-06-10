import { NextResponse } from "next/server";

import { hasValidSession, isCronAuthorized } from "@/lib/auth/session";
import { runDailyDigest } from "@/lib/jobs/dailyDigest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  return handleDigestRequest(request, false);
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  return handleDigestRequest(request, url.searchParams.get("force") === "1");
}

async function handleDigestRequest(request: Request, force: boolean) {
  const authorized = isCronAuthorized(request) || (await hasValidSession());
  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runDailyDigest({ force });
  const status = result.status === "failed" ? 500 : 200;
  return NextResponse.json(result, { status });
}

import { stableHash } from "@/lib/sources/hash";
import type { SourceCollectionResult, SourceItemInput } from "@/lib/sources/types";

type FredReleaseDate = {
  release_id: number;
  release_name: string;
  date: string;
};

export async function collectFredReleaseItems(daysAhead = 21): Promise<SourceCollectionResult> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    return { items: [], warnings: ["FRED_API_KEY not configured; skipped FRED release calendar."] };
  }

  const realtimeStart = new Date();
  const realtimeEnd = new Date(realtimeStart.getTime() + daysAhead * 24 * 60 * 60_000);
  const params = new URLSearchParams({
    api_key: apiKey,
    file_type: "json",
    realtime_start: toDate(realtimeStart),
    realtime_end: toDate(realtimeEnd),
    include_release_dates_with_no_data: "false"
  });
  const url = `https://api.stlouisfed.org/fred/releases/dates?${params.toString()}`;

  try {
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) {
      throw new Error(`FRED ${response.status}`);
    }
    const payload = (await response.json()) as { release_dates?: FredReleaseDate[] };
    const items: SourceItemInput[] = (payload.release_dates ?? []).slice(0, 80).map((release) => ({
      sourceType: "fred",
      sourceName: "FRED Release Calendar",
      externalId: `${release.release_id}:${release.date}`,
      title: `${release.release_name} scheduled for ${release.date}`,
      url: `https://fred.stlouisfed.org/release?rid=${release.release_id}`,
      publishedAt: new Date(`${release.date}T12:00:00Z`),
      contentHash: stableHash(["fred", String(release.release_id), release.date]),
      summary: `Upcoming macroeconomic data release: ${release.release_name}.`,
      rawJson: release as unknown as Record<string, unknown>
    }));
    return { items, warnings: [] };
  } catch (error) {
    return {
      items: [],
      warnings: [`FRED release calendar failed: ${error instanceof Error ? error.message : "unknown error"}`]
    };
  }
}

function toDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

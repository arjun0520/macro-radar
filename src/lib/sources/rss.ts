import Parser from "rss-parser";

import { stableHash } from "@/lib/sources/hash";
import type { SourceCollectionResult, SourceItemInput } from "@/lib/sources/types";

const parser = new Parser({
  timeout: 10_000,
  headers: {
    "User-Agent": process.env.SEC_USER_AGENT ?? "MacroRadar/0.1"
  }
});

const MACRO_FEEDS = [
  {
    sourceName: "Federal Reserve Press Releases",
    url: "https://www.federalreserve.gov/feeds/press_all.xml"
  }
] as const;

export async function collectMacroRssItems(maxPerFeed = 8): Promise<SourceCollectionResult> {
  const items: SourceItemInput[] = [];
  const warnings: string[] = [];

  for (const feed of MACRO_FEEDS) {
    try {
      const parsed = await parser.parseURL(feed.url);
      for (const entry of parsed.items.slice(0, maxPerFeed)) {
        const title = entry.title?.trim();
        if (!title) continue;

        const url = entry.link ?? feed.url;
        const publishedAt = parseDate(entry.isoDate ?? entry.pubDate);
        items.push({
          sourceType: feed.sourceName.startsWith("BLS") ? "bls" : "rss",
          sourceName: feed.sourceName,
          externalId: entry.guid ?? url ?? title,
          title,
          url,
          publishedAt,
          contentHash: stableHash([feed.sourceName, entry.guid, url, title]),
          summary: stripHtml(entry.contentSnippet ?? entry.content ?? ""),
          rawJson: {
            feedUrl: feed.url,
            categories: entry.categories ?? []
          }
        });
      }
    } catch (error) {
      warnings.push(`${feed.sourceName} feed failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  return { items, warnings };
}

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 800);
}

import { stableHash } from "@/lib/sources/hash";
import type { SourceCollectionResult, SourceItemInput } from "@/lib/sources/types";

type CompanyTicker = {
  cik_str: number;
  ticker: string;
  title: string;
};

type SecFiling = {
  accessionNumber: string[];
  filingDate: string[];
  reportDate: string[];
  form: string[];
  primaryDocument: string[];
};

const MATERIAL_FORMS = new Set(["8-K", "10-Q", "10-K", "S-1", "424B2", "DEF 14A"]);

export async function collectSecFilings(symbols: string[], daysBack = 14): Promise<SourceCollectionResult> {
  if (symbols.length === 0) return { items: [], warnings: [] };

  const warnings: string[] = [];
  const items: SourceItemInput[] = [];
  const userAgent = process.env.SEC_USER_AGENT ?? "MacroRadar/0.1 contact@example.com";

  try {
    const tickerResponse = await fetch("https://www.sec.gov/files/company_tickers.json", {
      headers: { "User-Agent": userAgent },
      next: { revalidate: 86_400 }
    });
    if (!tickerResponse.ok) throw new Error(`SEC ticker map ${tickerResponse.status}`);
    const tickerMap = (await tickerResponse.json()) as Record<string, CompanyTicker>;
    const bySymbol = new Map(Object.values(tickerMap).map((company) => [company.ticker.toUpperCase(), company]));
    const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60_000);

    for (const symbol of symbols) {
      const company = bySymbol.get(symbol.toUpperCase());
      if (!company) {
        warnings.push(`SEC CIK not found for ${symbol}.`);
        continue;
      }

      const cik = String(company.cik_str).padStart(10, "0");
      const response = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
        headers: { "User-Agent": userAgent },
        next: { revalidate: 3600 }
      });
      if (!response.ok) {
        warnings.push(`SEC submissions failed for ${symbol}: ${response.status}`);
        continue;
      }

      const payload = (await response.json()) as { filings?: { recent?: SecFiling } };
      const recent = payload.filings?.recent;
      if (!recent) continue;

      for (let index = 0; index < recent.accessionNumber.length; index += 1) {
        const form = recent.form[index];
        if (!MATERIAL_FORMS.has(form)) continue;
        const filingDate = new Date(`${recent.filingDate[index]}T12:00:00Z`);
        if (filingDate < cutoff) continue;

        const accession = recent.accessionNumber[index];
        const accessionNoDashes = accession.replaceAll("-", "");
        const document = recent.primaryDocument[index];
        const url = `https://www.sec.gov/Archives/edgar/data/${company.cik_str}/${accessionNoDashes}/${document}`;
        items.push({
          sourceType: "sec",
          sourceName: "SEC EDGAR",
          externalId: accession,
          title: `${company.ticker}: ${form} filed by ${company.title}`,
          url,
          publishedAt: filingDate,
          contentHash: stableHash(["sec", accession, document]),
          summary: `${company.title} filed ${form} on ${recent.filingDate[index]}.`,
          rawJson: {
            symbol: company.ticker,
            company: company.title,
            cik: company.cik_str,
            form,
            reportDate: recent.reportDate[index],
            accession
          }
        });
      }
    }
  } catch (error) {
    warnings.push(`SEC collection failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  return { items, warnings };
}

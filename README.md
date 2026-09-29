# Macro Radar

Mobile-first macro and portfolio signal dashboard for a single private user.

## What it does

- Maintains a manual US stock/ETF watchlist.
- Runs a daily Vercel Cron digest.
- Pulls free/official sources first: FRED, BLS API, BEA, Treasury FiscalData, EIA, Census, SEC EDGAR, Federal Reserve RSS, Finnhub when configured, and optional Trading Economics/FMP calendars.
- Uses the OpenAI Responses API with structured JSON to rank high-signal events.
- Stores normalized source items, economic calendar events, macro events, signal scores, alerts, feedback, and job runs in Neon/Postgres via Drizzle.
- Shows per-run source, LLM phase, token usage, fallback, and step-timing diagnostics in Settings.
- Sends in-app alerts and optional email alerts for high-signal events.

This app is decision support only. It does not place trades and does not provide financial advice.

## Local setup

```bash
npm install
cp .env.example .env.local
```

Fill in at least:

- `APP_PASSWORD`
- `AUTH_SECRET`
- `CRON_SECRET`
- `DATABASE_URL`
- `OPENAI_API_KEY`

Create the database schema from the checked-in migration:

```bash
npm run db:migrate
```

Run locally:

```bash
npm run dev
```

Open `http://localhost:3000`, log in with `APP_PASSWORD`, add tickers, then use **Run now**.

## Vercel deployment

1. Create a new Vercel project from this folder.
2. Add a Neon/Postgres integration through Vercel Marketplace.
3. Add the environment variables from `.env.example`.
4. Deploy. The daily digest auto-runs idempotent migrations before it touches the database unless `AUTO_RUN_MIGRATIONS="false"`.

For Vercel environment variables, paste values without wrapping quotes. For example, use `gpt-5.4-mini`, not `"gpt-5.4-mini"`, for `OPENAI_MODEL`.

`OPENAI_MODEL` is used for both LLM stages by default. If you want separate model routing later, set `OPENAI_EXTRACTION_MODEL` and/or `OPENAI_RANKING_MODEL`; otherwise leave them blank.

You can still run the protected migration endpoint manually when needed:

```bash
curl -X POST https://macro-radar-zeta.vercel.app/api/admin/migrate \
  -H "Authorization: Bearer $CRON_SECRET"
```

Vercel Cron invokes `/api/jobs/daily-digest` on weekdays. The route requires `CRON_SECRET` for external requests and also accepts an authenticated manual run from the UI.

## Validation

```bash
npm run test
npm run build
```

Optional mobile flow:

```bash
npm run test:e2e
```

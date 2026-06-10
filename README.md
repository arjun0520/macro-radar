# Macro Radar

Mobile-first macro and portfolio signal dashboard for a single private user.

## What it does

- Maintains a manual US stock/ETF watchlist.
- Runs a daily Vercel Cron digest.
- Pulls free/official sources first: FRED, BLS RSS, SEC EDGAR, Finnhub earnings when configured, and curated macro RSS.
- Uses the OpenAI Responses API with web search and structured JSON to rank high-signal events.
- Stores normalized source items, events, signal scores, alerts, and job runs in Neon/Postgres via Drizzle.
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
4. Deploy.
5. Run `npm run db:migrate` from a local shell pointed at the production `DATABASE_URL`, or use a CI migration step.

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

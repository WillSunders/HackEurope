# HackEurope

Wattprint demo with Stripe Climate checkout, a React dashboard, and a metrics ingestion Lambda.

## What this does
- Fetches Stripe Climate price per metric ton.
- Runs Stripe Checkout in test mode.
- Tracks paid emissions on the backend via webhook.
- Creates a Stripe Climate order when 5 tons are accumulated.
- Renders a React dashboard with summary cards, charts, breakdowns, exports, and receipts.
- Provides an AWS Lambda handler to ingest metrics JSON/JSONL into Supabase Postgres.

## Quick start (recommended)

1. Install dependencies for backend + lambda:

```bash
npm run install:all
```

2. Create `.env` in repo root:

```bash
cp .env.example .env
```

Update `.env` with your Stripe keys and Supabase credentials.

3. Start the backend:

```bash
npm start
```

4. Open the app:

```text
http://localhost:4242
```

## Webhook setup (required for totals + climate orders)
Use Stripe CLI to forward webhook events:

```bash
stripe listen --forward-to localhost:4242/api/stripe/webhook
```

## Dashboard APIs
- `GET /api/dashboard/summary`
- `GET /api/dashboard/breakdown?groupBy=team|service|user|device|region`
- `GET /api/export?from=YYYY-MM-DD&to=YYYY-MM-DD&device=A100&user=alex&format=csv|json`
- `GET /api/receipts?period=YYYY-MM`

### Dashboard data source
If `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in `.env`, the dashboard pulls live data from Supabase (`energy_metrics`). Otherwise it falls back to mock data in `backend/src/data/mockUsage.js`.

## Metrics Lambda (Supabase Postgres)

1. Create table in Supabase:

```sql
-- See lambda/schema.sql
```

2. Install Lambda deps:

```bash
cd lambda
npm install
```

3. Set environment variables in Lambda:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
```

4. Lambda handler:

```
lambda/handler.js
```

### Payload formats
- `application/json`: single object or array
- `text/plain`: JSONL (one JSON object per line)

### Example JSON
```json
{
  "org_id": "placeholder",
  "user_id": "user_ID_Placeholdler",
  "device_id": "PEARL_LENOVO_21K50033UK",
  "start_time": "2026-02-14T20:59:58",
  "state": "Connected standby",
  "duration_seconds": 63,
  "energy_drained_mwh": 560.0
}
```

## Local Lambda test

```bash
npm run test:lambda
```

## Docker
Build and run the service in a container:

```bash
docker build -t carbonops .
docker run --rm -p 4242:4242 --env-file .env carbonops
```

## Download the Windows Client

The Windows data collection client runs silently in the background and reports your device's energy usage hourly.

**[⬇ Download main.exe](https://github.com/YOUR_ORG/YOUR_REPO/releases/latest/download/main.exe)**

### Setup
1. Download `main.exe` above
2. Double-click to run — no installation needed
3. If Windows SmartScreen appears, click **"More info" → "Run anyway"** (expected for unsigned builds)
4. The app registers itself as an hourly background task automatically

That's it. It runs silently from that point on and uploads energy metrics to the dashboard.

### What it collects
- Laptop battery energy drain (via Windows battery report)
- Grid zone (detected automatically from your IP)

### Requirements
- Windows 10 or 11
- No admin privileges required

## Notes
- Everything runs in test mode. No live payments are accepted.
- Totals are stored in memory. Restarting the server resets totals.
- Mock data lives in `backend/src/data/mockUsage.js` and can be swapped for real telemetry.

# HackEurope

CarbonOps Network demo with Stripe Climate checkout, a React dashboard, and a metrics ingestion Lambda.

## What this does
- Fetches Stripe Climate price per metric ton.
- Runs Stripe Checkout in test mode.
- Tracks paid emissions on the backend via webhook.
- Creates a Stripe Climate order when 5 tons are accumulated.
- Renders a React dashboard with summary cards, charts, breakdowns, exports, and receipts.
- Provides an AWS Lambda handler to ingest metrics JSON/JSONL into Supabase Postgres.

## Quick start

1. Install backend deps:

```bash
cd backend
npm install
```

2. Add Stripe test credentials:

```bash
cp .env.example .env
```

Update `.env` with your Stripe test keys and webhook secret.

3. Run the server:

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

## Dashboard APIs (mock data)
- `GET /api/dashboard/summary`
- `GET /api/dashboard/breakdown?groupBy=team|service|user|device|region`
- `GET /api/export?from=YYYY-MM-DD&to=YYYY-MM-DD&device=A100&user=alex&format=csv|json`
- `GET /api/receipts?period=YYYY-MM`

### Dashboard data source
If `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in `.env`, the dashboard pulls live data from Supabase (`energy_metrics`). Otherwise it falls back to mock data in `backend/server.js`.

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

3. Set environment variable in Lambda:

```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.dgzwhtjsaxuhqqjwbimm.supabase.co:5432/postgres
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

## Docker
Build and run the service in a container:

```bash
docker build -t carbonops .
docker run --rm -p 4242:4242 --env-file backend/.env carbonops
```

## Notes
- Everything runs in test mode. No live payments are accepted.
- Totals are stored in memory. Restarting the server resets totals.
- Mock data lives in `backend/server.js` and can be swapped for real telemetry.

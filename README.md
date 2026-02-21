# HackEurope

CarbonOps Network demo with Stripe Climate checkout and a React dashboard.

## What this does
- Fetches Stripe Climate price per metric ton.
- Runs Stripe Checkout in test mode.
- Tracks paid emissions on the backend via webhook.
- Creates a Stripe Climate order when 5 tons are accumulated.
- Renders a React dashboard with summary cards, charts, breakdowns, exports, and receipts.

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

## Notes
- Everything runs in test mode. No live payments are accepted.
- Totals are stored in memory. Restarting the server resets totals.
- Mock data lives in `backend/server.js` and can be swapped for real telemetry.

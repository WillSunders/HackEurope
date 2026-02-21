# HackEurope

Stripe Climate checkout flow for test carbon offsets.

## What this does
- Fetches Stripe Climate price per metric ton.
- Calculates checkout totals on the frontend.
- Runs Stripe Checkout in test mode.
- Tracks paid emissions on the backend.
- Once 5 tons are accumulated, creates a Stripe Climate order for 5 tons.

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

## Notes
- Everything runs in test mode. No live payments are accepted.
- Totals are stored in memory. Restarting the server resets totals.

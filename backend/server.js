const path = require("path");
const express = require("express");
const dotenv = require("dotenv");
const Stripe = require("stripe");

dotenv.config();

const app = express();
const port = process.env.PORT || 4242;

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  console.warn("Missing STRIPE_SECRET_KEY. Stripe calls will fail until it is set.");
}

const stripe = new Stripe(stripeSecretKey || "", {
  apiVersion: process.env.STRIPE_API_VERSION || "2025-11-17.preview"
});

const MIN_TONS_PER_ORDER = Number(process.env.MIN_TONS_PER_ORDER || 5);

const state = {
  totalTons: 0,
  pendingTons: 0,
  totalCheckouts: 0,
  climateOrders: [],
  processedSessions: new Set()
};

const mockUsage = [
  { id: "run_001", timestamp: "2026-02-01T08:00:00Z", team: "ml-research", service: "training", user: "alex", device: "A100", region: "EU-DE", energyKwh: 420, carbonKg: 128, cost: 84.0 },
  { id: "run_002", timestamp: "2026-02-03T12:00:00Z", team: "platform", service: "inference", user: "mira", device: "L40S", region: "EU-FR", energyKwh: 180, carbonKg: 52, cost: 39.6 },
  { id: "run_003", timestamp: "2026-02-05T16:00:00Z", team: "ml-research", service: "training", user: "sam", device: "H100", region: "EU-NL", energyKwh: 510, carbonKg: 142, cost: 101.5 },
  { id: "run_004", timestamp: "2026-02-07T21:00:00Z", team: "app", service: "batch", user: "lina", device: "A10G", region: "EU-DE", energyKwh: 95, carbonKg: 31, cost: 18.4 },
  { id: "run_005", timestamp: "2026-02-10T10:00:00Z", team: "platform", service: "inference", user: "ravi", device: "L40S", region: "EU-ES", energyKwh: 210, carbonKg: 63, cost: 45.0 },
  { id: "run_006", timestamp: "2026-02-13T06:00:00Z", team: "ml-research", service: "training", user: "alex", device: "H100", region: "EU-DE", energyKwh: 580, carbonKg: 171, cost: 116.0 },
  { id: "run_007", timestamp: "2026-02-16T04:00:00Z", team: "app", service: "batch", user: "lina", device: "A10G", region: "EU-FI", energyKwh: 120, carbonKg: 18, cost: 22.1 },
  { id: "run_008", timestamp: "2026-02-19T18:00:00Z", team: "platform", service: "inference", user: "mira", device: "L40S", region: "EU-DE", energyKwh: 190, carbonKg: 55, cost: 41.2 }
];

const mockTimeSeries = [
  { date: "2026-02-01", energyKwh: 420, carbonKg: 128, cost: 84.0 },
  { date: "2026-02-03", energyKwh: 180, carbonKg: 52, cost: 39.6 },
  { date: "2026-02-05", energyKwh: 510, carbonKg: 142, cost: 101.5 },
  { date: "2026-02-07", energyKwh: 95, carbonKg: 31, cost: 18.4 },
  { date: "2026-02-10", energyKwh: 210, carbonKg: 63, cost: 45.0 },
  { date: "2026-02-13", energyKwh: 580, carbonKg: 171, cost: 116.0 },
  { date: "2026-02-16", energyKwh: 120, carbonKg: 18, cost: 22.1 },
  { date: "2026-02-19", energyKwh: 190, carbonKg: 55, cost: 41.2 }
];

function baseUrlFromRequest(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL;
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  return `${proto}://${req.get("host")}`;
}

async function resolveClimateProduct() {
  if (process.env.STRIPE_CLIMATE_PRODUCT_ID) {
    const product = await stripe.climate.products.retrieve(process.env.STRIPE_CLIMATE_PRODUCT_ID);
    return product;
  }
  const list = await stripe.climate.products.list({ limit: 1 });
  if (!list.data.length) throw new Error("No climate products available.");
  return list.data[0];
}

function normalizePricePerTon(product) {
  const prices = product.current_prices_per_metric_ton;
  if (!prices || typeof prices !== "object") throw new Error("Climate product missing current_prices_per_metric_ton.");
  const currency = Object.keys(prices)[0];
  const price = currency ? prices[currency] : null;
  if (!price || typeof price.amount_total !== "number") throw new Error("Climate product missing current_prices_per_metric_ton.");
  return { unitAmount: price.amount_total, currency };
}

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function filterUsage({ from, to, device, user }) {
  const fromDate = parseDate(from);
  const toDate = parseDate(to);
  return mockUsage.filter((entry) => {
    const timestamp = new Date(entry.timestamp);
    if (fromDate && timestamp < fromDate) return false;
    if (toDate && timestamp > toDate) return false;
    if (device && entry.device !== device) return false;
    if (user && entry.user !== user) return false;
    return true;
  });
}

function groupBy(records, key) {
  return records.reduce((acc, record) => {
    const value = record[key] || "unknown";
    if (!acc[value]) acc[value] = { key: value, energyKwh: 0, carbonKg: 0, cost: 0 };
    acc[value].energyKwh += record.energyKwh;
    acc[value].carbonKg += record.carbonKg;
    acc[value].cost += record.cost;
    return acc;
  }, {});
}

function formatCsv(records) {
  const header = ["id", "timestamp", "team", "service", "user", "device", "region", "energy_kwh", "carbon_kg", "cost"];
  const lines = records.map((entry) => [entry.id, entry.timestamp, entry.team, entry.service, entry.user, entry.device, entry.region, entry.energyKwh, entry.carbonKg, entry.cost].join(","));
  return [header.join(","), ...lines].join("\n");
}

async function createClimateOrderIfReady() {
  while (state.pendingTons >= MIN_TONS_PER_ORDER) {
    const product = await resolveClimateProduct();
    const order = await stripe.climate.orders.create({ product: product.id, metric_tons: MIN_TONS_PER_ORDER });
    state.pendingTons -= MIN_TONS_PER_ORDER;
    state.climateOrders.push({ id: order.id, metricTons: order.metric_tons, created: order.created });
  }
}

// ── Imports ───────────────────────────────────────────────────────────────────
const { getCarbonIntensity } = require('./grid_signals');
const { storeBillingRecord, getBillingRecords } = require('./billing_records');
const { upsertEmissionsTotals, getEmissionsTotals } = require('./emissions_totals');
const { aggregateEmissions } = require('./aggregation_job');

// ── Middleware ────────────────────────────────────────────────────────────────
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const signature = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;
  try {
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    } else {
      event = JSON.parse(req.body.toString("utf8"));
    }
  } catch (err) {
    console.error("Webhook signature verification failed.", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    if (!state.processedSessions.has(session.id)) {
      const metricTons = Number(session.metadata?.metricTons || 0);
      if (metricTons > 0) {
        state.totalTons += metricTons;
        state.pendingTons += metricTons;
        state.totalCheckouts += 1;
      }
      state.processedSessions.add(session.id);
      try {
        await createClimateOrderIfReady();
      } catch (err) {
        console.error("Climate order creation failed.", err.message);
      }
    }
  }
  res.json({ received: true });
});

app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => res.json({ ok: true }));

app.get("/api/climate/product", async (req, res) => {
  try {
    const product = await resolveClimateProduct();
    const price = normalizePricePerTon(product);
    res.json({ id: product.id, name: product.name, unitAmount: price.unitAmount, currency: price.currency, minimumOrderTons: MIN_TONS_PER_ORDER });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/offset/summary", (req, res) => {
  res.json({ totalTons: state.totalTons, pendingTons: state.pendingTons, totalCheckouts: state.totalCheckouts, climateOrders: state.climateOrders });
});

app.get("/api/dashboard/summary", (req, res) => {
  const totalEnergy = mockUsage.reduce((sum, item) => sum + item.energyKwh, 0);
  const totalCarbon = mockUsage.reduce((sum, item) => sum + item.carbonKg, 0);
  const totalCost = mockUsage.reduce((sum, item) => sum + item.cost, 0);
  res.json({ totals: { energyKwh: totalEnergy, carbonKg: totalCarbon, cost: totalCost }, timeSeries: mockTimeSeries, removalStatus: { pendingTons: state.pendingTons, totalTons: state.totalTons, climateOrders: state.climateOrders } });
});

app.get("/api/dashboard/breakdown", (req, res) => {
  const groupKey = req.query.groupBy || "team";
  const allowedKeys = new Set(["team", "service", "user", "device", "region"]);
  if (!allowedKeys.has(groupKey)) return res.status(400).json({ error: "Invalid groupBy value." });
  const grouped = groupBy(mockUsage, groupKey);
  res.json({ groupBy: groupKey, data: Object.values(grouped).sort((a, b) => b.energyKwh - a.energyKwh) });
});

app.get("/api/export", (req, res) => {
  const { format = "csv", from, to, device, user } = req.query;
  const records = filterUsage({ from, to, device, user });
  if (format === "json") return res.json({ records });
  const csv = formatCsv(records);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=\"carbonops-export.csv\"");
  res.send(csv);
});

app.get("/api/receipts", (req, res) => {
  const period = req.query.period || "2026-02";
  const order = state.climateOrders[state.climateOrders.length - 1];
  res.json({ period, receiptId: `receipt_${period.replace("-", "")}`, stripeClimateOrderId: order ? order.id : null, offsetKg: order ? Math.round(order.metricTons * 1000) : 0, status: order ? "confirmed" : "pending" });
});

app.post("/api/checkout/session", async (req, res) => {
  try {
    const metricTons = Number(req.body.metricTons);
    const team = typeof req.body.team === "string" ? req.body.team : "";
    const note = typeof req.body.note === "string" ? req.body.note : "";
    if (!Number.isFinite(metricTons) || metricTons <= 0) return res.status(400).json({ error: "metricTons must be a positive number." });
    const product = await resolveClimateProduct();
    const price = normalizePricePerTon(product);
    const totalAmount = Math.round(price.unitAmount * metricTons);
    if (totalAmount < 50) return res.status(400).json({ error: "Total amount must be at least 50 (minimum Stripe charge)." });
    const baseUrl = baseUrlFromRequest(req);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{ price_data: { currency: price.currency, product_data: { name: `Carbon offset (${metricTons} tons)` }, unit_amount: totalAmount }, quantity: 1 }],
      metadata: { metricTons: metricTons.toString(), climateProduct: product.id, unitAmount: price.unitAmount.toString(), team, note },
      success_url: `${baseUrl}/?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/?canceled=1`
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── Carbon Intensity Routes ───────────────────────────────────────────────────
app.get('/api/carbon-intensity/:zone/:timestamp', async (req, res) => {
  try {
    const data = await getCarbonIntensity(req.params.zone, req.params.timestamp);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Billing Records Routes ────────────────────────────────────────────────────
app.post('/api/billing/record', async (req, res) => {
  try {
    const record = await storeBillingRecord(req.body);
    res.json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/billing/records', async (req, res) => {
  try {
    const records = await getBillingRecords(req.query.billing_period);
    res.json({ records });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Emissions Totals Routes ───────────────────────────────────────────────────
app.post('/api/emissions/totals', async (req, res) => {
  try {
    const record = await upsertEmissionsTotals(req.body);
    res.json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/emissions/totals', async (req, res) => {
  try {
    const records = await getEmissionsTotals(req.query);
    res.json({ records });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Aggregation Job Routes ────────────────────────────────────────────────────
app.get('/api/aggregation/:window', async (req, res) => {
  try {
    const result = await aggregateEmissions(req.params.window);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Static Frontend ───────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "..", "frontend")));

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
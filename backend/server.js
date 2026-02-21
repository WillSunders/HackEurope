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

function baseUrlFromRequest(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL;
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  return `${proto}://${req.get("host")}`;
}

async function resolveClimateProduct() {
  if (process.env.STRIPE_CLIMATE_PRODUCT_ID) {
    const product = await stripe.climate.products.retrieve(
      process.env.STRIPE_CLIMATE_PRODUCT_ID
    );
    return product;
  }
  const list = await stripe.climate.products.list({ limit: 1 });
  if (!list.data.length) throw new Error("No climate products available.");
  return list.data[0];
}

function normalizePricePerTon(product) {
  const prices = product.current_prices_per_metric_ton;
  if (!prices || typeof prices !== "object") {
    throw new Error("Climate product missing current_prices_per_metric_ton.");
  }

  const currency = Object.keys(prices)[0];
  const price = currency ? prices[currency] : null;
  if (!price || typeof price.amount_total !== "number") {
    throw new Error("Climate product missing current_prices_per_metric_ton.");
  }

  return {
    unitAmount: price.amount_total,
    currency
  };
}

async function createClimateOrderIfReady() {
  while (state.pendingTons >= MIN_TONS_PER_ORDER) {
    const product = await resolveClimateProduct();
    const order = await stripe.climate.orders.create({
      product: product.id,
      metric_tons: MIN_TONS_PER_ORDER
    });
    state.pendingTons -= MIN_TONS_PER_ORDER;
    state.climateOrders.push({
      id: order.id,
      metricTons: order.metric_tons,
      created: order.created
    });
  }
}

app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
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
  }
);

app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/climate/product", async (req, res) => {
  try {
    const product = await resolveClimateProduct();
    const price = normalizePricePerTon(product);
    res.json({
      id: product.id,
      name: product.name,
      unitAmount: price.unitAmount,
      currency: price.currency,
      minimumOrderTons: MIN_TONS_PER_ORDER
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/offset/summary", (req, res) => {
  res.json({
    totalTons: state.totalTons,
    pendingTons: state.pendingTons,
    totalCheckouts: state.totalCheckouts,
    climateOrders: state.climateOrders
  });
});

app.post("/api/checkout/session", async (req, res) => {
  try {
    const metricTons = Number(req.body.metricTons);
    if (!Number.isFinite(metricTons) || metricTons <= 0) {
      return res.status(400).json({ error: "metricTons must be a positive number." });
    }

    const product = await resolveClimateProduct();
    const price = normalizePricePerTon(product);
    const totalAmount = Math.round(price.unitAmount * metricTons);

    if (totalAmount < 50) {
      return res.status(400).json({
        error: "Total amount must be at least 50 (minimum Stripe charge)."
      });
    }

    const baseUrl = baseUrlFromRequest(req);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: price.currency,
            product_data: {
              name: `Carbon offset (${metricTons} tons)`
            },
            unit_amount: totalAmount
          },
          quantity: 1
        }
      ],
      metadata: {
        metricTons: metricTons.toString(),
        climateProduct: product.id,
        unitAmount: price.unitAmount.toString()
      },
      success_url: `${baseUrl}/?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/?canceled=1`
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.use(express.static(path.join(__dirname, "..", "frontend")));

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

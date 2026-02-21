const path = require("path");
const express = require("express");
const dotenv = require("dotenv");
const Stripe = require("stripe");
const { registerApi } = require("./src/api");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const app = express();
const port = process.env.PORT || 4242;

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  console.warn("Missing STRIPE_SECRET_KEY. Stripe calls will fail until it is set.");
}

const stripe = new Stripe(stripeSecretKey || "", {
  apiVersion: process.env.STRIPE_API_VERSION || "2025-11-17.preview"
});

const state = {
  totalTons: 0,
  pendingTons: 0,
  totalCheckouts: 0,
  climateOrders: [],
  processedSessions: new Set()
};

registerApi(app, {
  stripe,
  state,
  config: {
    minTonsPerOrder: Number(process.env.MIN_TONS_PER_ORDER || 5),
    carbonIntensityKgPerKwh: Number(
      process.env.CARBON_INTENSITY_KG_PER_KWH || 0.187
    ),
    costPerKwh: Number(process.env.COST_PER_KWH || 0.2),
    publicBaseUrl: process.env.PUBLIC_BASE_URL,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
  }
});

app.use(express.static(path.join(__dirname, "..", "frontend")));

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

const express = require("express");
const { createSupabaseService } = require("../services/supabase");
const { registerStripeRoutes } = require("../routes/stripe");
const { createMetricsRouter } = require("../routes/metrics");
const { registerDashboardRoutes } = require("../routes/dashboard");
const { mockUsage, mockTimeSeries } = require("../data/mockUsage");

function registerApi(app, { stripe, state, config }) {
  const supabaseService = createSupabaseService({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey
  });

  const router = express.Router();

  registerStripeRoutes(router, { stripe, state, config });
  registerDashboardRoutes(router, {
    supabaseService,
    mockUsage,
    mockTimeSeries,
    config,
    state
  });

  router.use(createMetricsRouter({ supabaseService }));

  app.use(router);
}

module.exports = { registerApi };

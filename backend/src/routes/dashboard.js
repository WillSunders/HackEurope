const {
  metricsToUsage,
  filterUsage,
  groupBy,
  buildTimeSeries,
  formatCsv
} = require("../utils/metrics");

function registerDashboardRoutes(router, { supabaseService, mockUsage, mockTimeSeries, config, state }) {
  const { carbonIntensityKgPerKwh, costPerKwh } = config;

  async function loadUsage(filters) {
    const metrics = (await supabaseService.fetchEnergyMetrics(filters)) || [];
    if (!metrics.length) return { usage: mockUsage, usingMock: true };
    return {
      usage: metricsToUsage(metrics, { carbonIntensityKgPerKwh, costPerKwh }),
      usingMock: false
    };
  }

  router.get("/api/dashboard/summary", async (req, res) => {
    try {
      const { usage, usingMock } = await loadUsage({
        from: req.query.from,
        to: req.query.to
      });

      const totalEnergy = usage.reduce((sum, item) => sum + item.energyKwh, 0);
      const totalCarbon = usage.reduce((sum, item) => sum + item.carbonKg, 0);
      const totalCost = usage.reduce((sum, item) => sum + item.cost, 0);

      res.json({
        totals: {
          energyKwh: totalEnergy,
          carbonKg: totalCarbon,
          cost: totalCost
        },
        timeSeries: usingMock ? mockTimeSeries : buildTimeSeries(usage),
        removalStatus: {
          pendingTons: state.pendingTons,
          totalTons: state.totalTons,
          climateOrders: state.climateOrders
        }
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  router.get("/api/dashboard/breakdown", async (req, res) => {
    const groupKey = req.query.groupBy || "team";
    const allowedKeys = new Set(["team", "service", "user", "device", "region"]);
    if (!allowedKeys.has(groupKey)) {
      return res.status(400).json({ error: "Invalid groupBy value." });
    }

    try {
      const { usage } = await loadUsage({
        from: req.query.from,
        to: req.query.to,
        device: req.query.device,
        user: req.query.user
      });

      const grouped = groupBy(usage, groupKey);
      res.json({
        groupBy: groupKey,
        data: Object.values(grouped).sort((a, b) => b.energyKwh - a.energyKwh)
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  router.get("/api/export", async (req, res) => {
    const { format = "csv", from, to, device, user } = req.query;

    try {
      const { usage } = await loadUsage({ from, to, device, user });
      const records = filterUsage(usage, { from, to, device, user });

      if (format === "json") {
        return res.json({ records });
      }

      const csv = formatCsv(records);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=\"carbonops-export.csv\""
      );
      res.send(csv);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { registerDashboardRoutes };

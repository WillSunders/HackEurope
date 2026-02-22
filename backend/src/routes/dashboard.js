const {
  metricsToUsage,
  filterUsage,
  groupBy,
  buildTimeSeries,
  formatCsv
} = require("../utils/metrics");

function registerDashboardRoutes(router, { supabaseService, mockUsage, mockTimeSeries, config, state }) {
  const { carbonIntensityKgPerKwh, costPerKwh } = config;

  async function loadUsage(source, filters) {
    const metrics =
      source === "llm"
        ? (await supabaseService.fetchLlmMetrics(filters)) || []
        : (await supabaseService.fetchEnergyMetrics(filters)) || [];
    if (!metrics.length && source === "compute") {
      return { usage: mockUsage, usingMock: true };
    }
    return {
      usage: metrics.length
        ? metricsToUsage(metrics, { carbonIntensityKgPerKwh, costPerKwh })
        : [],
      usingMock: false
    };
  }

  function mergeUsage(a, b) {
    return [...a, ...b];
  }

  router.get("/api/dashboard/summary", async (req, res) => {
    try {
      const { usage: computeUsage, usingMock } = await loadUsage("compute", {
        from: req.query.from,
        to: req.query.to
      });
      const { usage: llmUsage } = await loadUsage("llm", {
        from: req.query.from,
        to: req.query.to
      });

      const allUsage = mergeUsage(computeUsage, llmUsage);

      const totalEnergy = allUsage.reduce((sum, item) => sum + item.energyKwh, 0);
      const totalCarbon = allUsage.reduce((sum, item) => sum + item.carbonKg, 0);
      const totalCost = allUsage.reduce((sum, item) => sum + item.cost, 0);
      const computeTotals = computeUsage.reduce(
        (acc, item) => {
          acc.energyKwh += item.energyKwh;
          acc.carbonKg += item.carbonKg;
          acc.cost += item.cost;
          return acc;
        },
        { energyKwh: 0, carbonKg: 0, cost: 0 }
      );
      const llmTotals = llmUsage.reduce(
        (acc, item) => {
          acc.energyKwh += item.energyKwh;
          acc.carbonKg += item.carbonKg;
          acc.cost += item.cost;
          return acc;
        },
        { energyKwh: 0, carbonKg: 0, cost: 0 }
      );

      res.json({
        totals: {
          energyKwh: totalEnergy,
          carbonKg: totalCarbon,
          cost: totalCost
        },
        sources: {
          compute: computeTotals,
          llm: llmTotals
        },
        timeSeries: usingMock ? mockTimeSeries : buildTimeSeries(allUsage),
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
    const source = req.query.source || "compute";
    const allowedKeys = new Set(["team", "service", "user", "device", "region"]);
    if (!allowedKeys.has(groupKey)) {
      return res.status(400).json({ error: "Invalid groupBy value." });
    }

    try {
      const filters = {
        from: req.query.from,
        to: req.query.to,
        device: req.query.device,
        user: req.query.user
      };
      let usage = [];
      if (source === "all") {
        const { usage: computeUsage } = await loadUsage("compute", filters);
        const { usage: llmUsage } = await loadUsage("llm", filters);
        usage = mergeUsage(computeUsage, llmUsage);
      } else {
        const { usage: selectedUsage } = await loadUsage(
          source === "llm" ? "llm" : "compute",
          filters
        );
        usage = selectedUsage;
      }

      const grouped = groupBy(usage, groupKey);
      res.json({
        groupBy: groupKey,
        source,
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

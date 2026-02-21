const express = require("express");
const {
  parseMetricsPayload,
  normalizeMetricRecord,
  dedupeMetricRecords
} = require("../utils/metrics");

function createMetricsRouter({ supabaseService }) {
  const router = express.Router();

  router.post(
    "/api/metrics/ingest",
    express.text({ type: ["text/plain", "application/json"] }),
    async (req, res) => {
      try {
        const contentType = req.headers["content-type"] || "";
        const payload = parseMetricsPayload(req.body, contentType);
        const records = dedupeMetricRecords(payload.map(normalizeMetricRecord));

        if (!records.length) {
          return res.status(400).json({ error: "No records provided." });
        }

        await supabaseService.insertEnergyMetrics(records);
        res.json({ inserted: records.length });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
      }
    }
  );

  return router;
}

module.exports = { createMetricsRouter };

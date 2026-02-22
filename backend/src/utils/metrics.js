function parseDate(value) {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
}

function parseMetricsPayload(rawBody, contentType) {
    if (!rawBody) return [];
    if (Array.isArray(rawBody)) return rawBody;
    if (typeof rawBody === "object") return [rawBody];
    if (contentType && contentType.includes("application/json")) {
        const parsed = JSON.parse(rawBody);
        return Array.isArray(parsed) ? parsed : [parsed];
    }
    return rawBody
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line));
}

function normalizeMetricRecord(record) {
    if (!record || typeof record !== "object") {
        throw new Error("Invalid record payload");
    }
    const required = [
        "org_id",
        "user_id",
        "device_id",
        "start_time",
        "state",
        "duration_seconds",
        "energy_drained_mwh",
        "zone",
    ];
    for (const key of required) {
        if (
            record[key] === undefined ||
            record[key] === null ||
            record[key] === ""
        ) {
            throw new Error(`Missing required field: ${key}`);
        }
    }
    return {
        org_id: String(record.org_id),
        user_id: String(record.user_id),
        device_id: String(record.device_id),
        start_time: record.start_time,
        state: String(record.state),
        duration_seconds: Number(record.duration_seconds),
        energy_drained_mwh: Number(record.energy_drained_mwh),
        zone: String(record.zone),
    };
}

function dedupeMetricRecords(records) {
    const seen = new Set();
    const unique = [];
    for (const record of records) {
        const key = [
            record.org_id,
            record.user_id,
            record.device_id,
            new Date(record.start_time).toISOString(),
        ].join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(record);
    }
    return unique;
}

function metricsToUsage(records, { carbonIntensityKgPerKwh, costPerKwh }) {
    return records.map((record, index) => {
        const energyKwh = Number(record.energy_drained_mwh) / 1000;
        const carbonKg = energyKwh * carbonIntensityKgPerKwh;
        const cost = energyKwh * costPerKwh;
        return {
            id: record.id || `${record.device_id}-${record.start_time}-${index}`,
            timestamp: record.start_time,
            team: record.org_id,
            service: record.state,
            user: record.user_id,
            device: record.device_id,
            region: record.region || "EU-UNKNOWN",
            energyKwh,
            carbonKg,
            cost,
        };
    });
}

function filterUsage(records, { from, to, device, user }) {
    const fromDate = parseDate(from);
    const toDate = parseDate(to);
    return records.filter((entry) => {
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
        if (!acc[value]) {
            acc[value] = { key: value, energyKwh: 0, carbonKg: 0, cost: 0 };
        }
        acc[value].energyKwh += record.energyKwh;
        acc[value].carbonKg += record.carbonKg;
        acc[value].cost += record.cost;
        return acc;
    }, {});
}

function buildTimeSeries(records) {
    const grouped = new Map();
    for (const record of records) {
        const dateKey = record.timestamp.slice(0, 10);
        const entry = grouped.get(dateKey) || {
            date: dateKey,
            energyKwh: 0,
            carbonKg: 0,
            cost: 0,
        };
        entry.energyKwh += record.energyKwh;
        entry.carbonKg += record.carbonKg;
        entry.cost += record.cost;
        grouped.set(dateKey, entry);
    }
    return Array.from(grouped.values()).sort((a, b) =>
        a.date.localeCompare(b.date),
    );
}

function formatCsv(records) {
    const header = [
        "id",
        "timestamp",
        "team",
        "service",
        "user",
        "device",
        "region",
        "energy_kwh",
        "carbon_kg",
        "cost",
    ];
    const lines = records.map((entry) =>
        [
            entry.id,
            entry.timestamp,
            entry.team,
            entry.service,
            entry.user,
            entry.device,
            entry.region,
            entry.energyKwh,
            entry.carbonKg,
            entry.cost,
        ].join(","),
    );
    return [header.join(","), ...lines].join("\n");
}

module.exports = {
    parseMetricsPayload,
    normalizeMetricRecord,
    dedupeMetricRecords,
    metricsToUsage,
    filterUsage,
    groupBy,
    buildTimeSeries,
    formatCsv,
};

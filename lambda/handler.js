const { Pool } = require("pg");

let pool;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set");
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
  }
  return pool;
}

function normalizeRecord(record) {
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
    "energy_drained_mwh"
  ];

  for (const key of required) {
    if (record[key] === undefined || record[key] === null || record[key] === "") {
      throw new Error(`Missing required field: ${key}`);
    }
  }

  return {
    org_id: String(record.org_id),
    user_id: String(record.user_id),
    device_id: String(record.device_id),
    start_time: new Date(record.start_time),
    state: String(record.state),
    duration_seconds: Number(record.duration_seconds),
    energy_drained_mwh: Number(record.energy_drained_mwh)
  };
}

function parsePayload(body, contentType) {
  if (!body) return [];

  const decoded = Buffer.from(body, "base64").toString("utf8");
  if (contentType && contentType.includes("application/json")) {
    const parsed = JSON.parse(decoded);
    if (Array.isArray(parsed)) return parsed;
    return [parsed];
  }

  return decoded
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function insertRecords(client, records) {
  const values = [];
  const placeholders = [];
  let index = 1;

  for (const record of records) {
    placeholders.push(
      `($${index++}, $${index++}, $${index++}, $${index++}, $${index++}, $${index++}, $${index++})`
    );
    values.push(
      record.org_id,
      record.user_id,
      record.device_id,
      record.start_time,
      record.state,
      record.duration_seconds,
      record.energy_drained_mwh
    );
  }

  const query = `
    INSERT INTO metrics (
      org_id,
      user_id,
      device_id,
      start_time,
      state,
      duration_seconds,
      energy_drained_mwh
    )
    VALUES ${placeholders.join(", ")}
  `;

  await client.query(query, values);
}

exports.handler = async (event) => {
  try {
    const contentType =
      event.headers?.["content-type"] || event.headers?.["Content-Type"] || "";
    const body = event.isBase64Encoded ? event.body : Buffer.from(event.body || "").toString("base64");
    const payload = parsePayload(body, contentType);

    const records = payload.map(normalizeRecord);
    if (!records.length) {
      return { statusCode: 400, body: JSON.stringify({ error: "No records provided" }) };
    }

    const client = await getPool().connect();
    try {
      await insertRecords(client, records);
    } finally {
      client.release();
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ inserted: records.length })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};

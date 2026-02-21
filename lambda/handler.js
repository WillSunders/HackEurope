function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    throw new Error("SUPABASE_URL is not set");
  }
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return { url, serviceRoleKey };
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

function parsePayload(rawBody, contentType) {
  if (!rawBody) return [];

  if (contentType && contentType.includes("application/json")) {
    const parsed = JSON.parse(rawBody);
    if (Array.isArray(parsed)) return parsed;
    return [parsed];
  }

  return rawBody
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function insertRecords(records) {
  const { url, serviceRoleKey } = getSupabaseConfig();

  const response = await fetch(`${url}/rest/v1/energy_metrics`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: "return=minimal"
    },
    body: JSON.stringify(records)
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase insert failed: ${message}`);
  }
}

exports.handler = async (event) => {
  try {
    const contentType =
      event.headers?.["content-type"] || event.headers?.["Content-Type"] || "";
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : event.body || "";
    const payload = parsePayload(rawBody, contentType);

    const records = payload.map(normalizeRecord);
    if (!records.length) {
      return { statusCode: 400, body: JSON.stringify({ error: "No records provided" }) };
    }

    await insertRecords(records);

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

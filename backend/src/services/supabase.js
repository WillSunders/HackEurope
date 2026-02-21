function createSupabaseService({ url, serviceRoleKey }) {
  function getConfig() {
    if (!url || !serviceRoleKey) return null;
    return { url, serviceRoleKey };
  }

  async function fetchEnergyMetrics({ from, to, device, user }) {
    const config = getConfig();
    if (!config) return null;

    const params = new URLSearchParams({
      select:
        "org_id,user_id,device_id,start_time,state,duration_seconds,energy_drained_mwh,created_at"
    });

    if (from) params.append("start_time", `gte.${from}`);
    if (to) params.append("start_time", `lte.${to}`);
    if (device) params.append("device_id", `eq.${device}`);
    if (user) params.append("user_id", `eq.${user}`);

    const response = await fetch(
      `${config.url}/rest/v1/energy_metrics?${params.toString()}`,
      {
        headers: {
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`
        }
      }
    );

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Supabase fetch failed: ${message}`);
    }

    return response.json();
  }

  async function insertEnergyMetrics(records) {
    const config = getConfig();
    if (!config) {
      throw new Error("Supabase credentials are not configured.");
    }

    const response = await fetch(
      `${config.url}/rest/v1/energy_metrics?on_conflict=org_id,user_id,device_id,start_time`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`,
          Prefer: "return=minimal, resolution=ignore-duplicates"
        },
        body: JSON.stringify(records)
      }
    );

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Supabase insert failed: ${message}`);
    }
  }

  return { fetchEnergyMetrics, insertEnergyMetrics };
}

module.exports = { createSupabaseService };

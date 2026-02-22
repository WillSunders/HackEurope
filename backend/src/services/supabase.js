function createSupabaseService({ url, serviceRoleKey }) {
  function getConfig() {
    if (!url || !serviceRoleKey) return null;
    return { url, serviceRoleKey };
  }

  async function fetchMetrics(table, { from, to, device, user }) {
    const config = getConfig();
    if (!config) return null;

    const tableName = table || "energy_metrics";
    const params = new URLSearchParams({
      select:
        "org_id,user_id,device_id,start_time,state,duration_seconds,energy_drained_mwh,created_at"
    });

    if (from) params.append("start_time", `gte.${from}`);
    if (to) params.append("start_time", `lte.${to}`);
    if (device) params.append("device_id", `eq.${device}`);
    if (user) params.append("user_id", `eq.${user}`);

    const response = await fetch(
      `${config.url}/rest/v1/${tableName}?${params.toString()}`,
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

  async function insertMetrics(records, table) {
    const config = getConfig();
    if (!config) {
      throw new Error("Supabase credentials are not configured.");
    }

    const tableName = table || "energy_metrics";
    const conflictTarget = "org_id,user_id,device_id,start_time";
    const response = await fetch(
      `${config.url}/rest/v1/${tableName}?on_conflict=${conflictTarget}`,
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

  return {
    fetchEnergyMetrics: (filters) => fetchMetrics("energy_metrics", filters),
    fetchLlmMetrics: (filters) => fetchMetrics("llm_energy_metrics", filters),
    fetchMetrics,
    insertMetrics
  };
}

module.exports = { createSupabaseService };

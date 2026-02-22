const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

function getWindowDates(window) {
    const now = new Date();
    if (window === 'daily') {
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        return { start: start.toISOString(), end: now.toISOString() };
    }
    if (window === 'monthly') {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        return { start: start.toISOString(), end: now.toISOString() };
    }
    throw new Error("window must be 'daily' or 'monthly'");
}

async function aggregateEmissions(window) {
    const { start, end } = getWindowDates(window);

    const { data, error } = await supabase
        .from('emissions_records')
        .select('*')
        .gte('timestamp', start)
        .lte('timestamp', end);

    if (error) throw new Error(`Failed to fetch emissions: ${error.message}`);

    const byDevice = {};
    const byUser = {};
    const byOrg = {};

    for (const record of data) {
        if (!byDevice[record.device]) byDevice[record.device] = { device: record.device, total_kgco2e: 0, total_energy_kwh: 0 };
        byDevice[record.device].total_kgco2e += record.emissions_gco2 / 1000;
        byDevice[record.device].total_energy_kwh += record.energy_kwh || 0;

        if (!byUser[record.user_id]) byUser[record.user_id] = { user_id: record.user_id, total_kgco2e: 0, total_energy_kwh: 0 };
        byUser[record.user_id].total_kgco2e += record.emissions_gco2 / 1000;
        byUser[record.user_id].total_energy_kwh += record.energy_kwh || 0;

        if (!byOrg[record.org]) byOrg[record.org] = { org: record.org, total_kgco2e: 0, total_energy_kwh: 0 };
        byOrg[record.org].total_kgco2e += record.emissions_gco2 / 1000;
        byOrg[record.org].total_energy_kwh += record.energy_kwh || 0;
    }

    return {
        window,
        period: { start, end },
        total_records: data.length,
        by_device: Object.values(byDevice),
        by_user: Object.values(byUser),
        by_org: Object.values(byOrg)
    };
}

module.exports = { aggregateEmissions };
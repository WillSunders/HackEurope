const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

async function upsertEmissionsTotals({ user_id, org_id, billing_period, total_kgco2e, total_energy_kwh, total_cost }) {
    const { data, error } = await supabase
        .from('emissions_totals')
        .upsert([{
            user_id,
            org_id,
            billing_period,
            total_kgco2e,
            total_energy_kwh,
            total_cost,
            updated_at: new Date().toISOString()
        }], { onConflict: 'user_id,org_id,billing_period' })
        .select();

    if (error) throw new Error(`Failed to upsert emissions totals: ${error.message}`);
    return data[0];
}

async function getEmissionsTotals({ user_id, org_id, billing_period }) {
    let query = supabase.from('emissions_totals').select('*');
    if (user_id) query = query.eq('user_id', user_id);
    if (org_id) query = query.eq('org_id', org_id);
    if (billing_period) query = query.eq('billing_period', billing_period);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch emissions totals: ${error.message}`);
    return data;
}

module.exports = { upsertEmissionsTotals, getEmissionsTotals };
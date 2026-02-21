const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

async function storeBillingRecord({ billing_period, invoice_id, charge_id, climate_order_id, amount_total, currency, metric_tons, status }) {
    const { data, error } = await supabase
        .from('billing_records')
        .insert([{
            billing_period,
            invoice_id,
            charge_id,
            climate_order_id,
            amount_total,
            currency,
            metric_tons,
            status: status || 'pending'
        }])
        .select();

    if (error) throw new Error(`Failed to store billing record: ${error.message}`);
    return data[0];
}

async function getBillingRecords(billing_period) {
    const query = supabase.from('billing_records').select('*');
    if (billing_period) query.eq('billing_period', billing_period);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch billing records: ${error.message}`);
    return data;
}

module.exports = { storeBillingRecord, getBillingRecords };
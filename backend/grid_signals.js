const axios = require('axios');

// Zone coordinates for EU regions
const ZONE_COORDS = {
    "EU-DE": { lat: 51.5, lon: 10.0, baseIntensity: 350 },
    "EU-FR": { lat: 46.2, lon: 2.2, baseIntensity: 85 },
    "EU-ES": { lat: 40.4, lon: -3.7, baseIntensity: 180 },
    "EU-PL": { lat: 52.0, lon: 19.0, baseIntensity: 750 },
    "EU-NL": { lat: 52.3, lon: 5.3, baseIntensity: 390 },
    "EU-IE": { lat: 53.3, lon: -8.0, baseIntensity: 350 },
    "EU-FI": { lat: 64.0, lon: 26.0, baseIntensity: 80 },
};

async function getCarbonIntensity(zone, timestamp) {
    try {
        const coords = ZONE_COORDS[zone.toUpperCase()];
        if (!coords) throw new Error(`Zone ${zone} not supported`);

        // Parse timestamp to get date
        const dt = new Date(timestamp);
        const date = dt.toISOString().split('T')[0];
        const hour = dt.getUTCHours();

        // Fetch real solar radiation from Open-Meteo
        const response = await axios.get(
            `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&hourly=shortwave_radiation&start_date=${date}&end_date=${date}`,
            { timeout: 10000 }
        );

        const hourlyData = response.data.hourly;
        const radiation = hourlyData.shortwave_radiation[hour] || 0;

        // Higher solar radiation = more renewables = lower carbon intensity
        // Max radiation ~500 W/m², reduce intensity by up to 40%
        const solarReductionFactor = Math.min(radiation / 500, 1) * 0.4;
        const adjustedIntensity = Math.round(
            coords.baseIntensity * (1 - solarReductionFactor)
        );

        return {
            zone,
            timestamp,
            carbon_intensity_gco2_per_kwh: adjustedIntensity,
            solar_radiation_wm2: radiation,
            source: "open-meteo-derived",
            method: "solar-adjusted-baseline"
        };

    } catch (error) {
        // Fallback to static
        const coords = ZONE_COORDS[zone] || { baseIntensity: 300 };
        return {
            zone,
            timestamp,
            carbon_intensity_gco2_per_kwh: coords.baseIntensity,
            source: "static_fallback"
        };
    }
}

async function getMultipleCarbonIntensities(requests) {
    const results = await Promise.all(
        requests.map(({ zone, timestamp }) => getCarbonIntensity(zone, timestamp))
    );
    return results;
}

module.exports = { getCarbonIntensity, getMultipleCarbonIntensities };
module.exports = { getCarbonIntensity };
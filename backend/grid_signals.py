import requests
import os
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("ELECTRICITY_MAPS_KEY")
BASE_URL = "https://api.electricitymaps.com/v3"

def get_carbon_intensity(zone: str, timestamp: str) -> dict:
    """
    Given zone + timestamp, retrieve gCO2/kWh
    timestamp format: ISO 8601 e.g. "2026-02-21T14:00:00Z"
    """
    try:
        response = requests.get(
            f"{BASE_URL}/carbon-intensity/past?zone={zone}&datetime={timestamp}",
            headers={"auth-token": API_KEY},
            timeout=10
        )

        if response.status_code == 429:
            raise Exception("Rate limit hit — too many requests")

        if response.status_code == 401:
            raise Exception("Invalid API key")

        if response.status_code == 404:
            raise Exception(f"Zone {zone} not found")

        response.raise_for_status()

        data = response.json()

        return {
            "zone": zone,
            "timestamp": timestamp,
            "carbon_intensity_gco2_per_kwh": data["carbonIntensity"],
            "is_estimated": data.get("isEstimated", False),
            "emission_factor_type": data.get("emissionFactorType")
        }

    except requests.exceptions.Timeout:
        raise Exception("Request timed out")
    except requests.exceptions.ConnectionError:
        raise Exception("Could not connect to Electricity Maps API")

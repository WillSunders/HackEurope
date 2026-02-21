"""
dataTransformer.py

Reads  test/fixtures/dataPipe/battery_data.jsonl  (written by dataGrabber.py)
Writes test/fixtures/dataPipe/metrics.jsonl       (ready for Supabase)

Output schema per row:
{
    "org_id"                    str,
    "user_id"                   str,
    "device_id":                str,    # COMPUTER_NAME + PRODUCT_NAME from system_info
    "start_time":                   str,    # ISO 8601 datetime of session start
    "state":                    str,    # "Active" | "Connected standby"
    "duration_seconds":         int,
    "energy_drained_mwh":       float,
}

Usage:
    python dataTransformer.py
"""

import json
import os
from datetime import datetime, date
import urllib.request


# ── config ────────────────────────────────────────────────────────────────────

# DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
DATA_DIR = os.environ.get(
    "CARBON_TRACKER_DATA_DIR", os.path.join(os.path.dirname(__file__), "data")
)
INPUT_PATH = os.path.join(DATA_DIR, "battery_data.jsonl")
OUTPUT_PATH = os.path.join(DATA_DIR, "metrics.jsonl")

CARBON_INTENSITY = None  # gCO2/kWh — set manually or leave None to fill later
ORG_ID = "placeholder"
USER_ID = "user_ID_Placeholdler"


# ── helpers ───────────────────────────────────────────────────────────────────
def get_zone() -> str:
    try:
        with urllib.request.urlopen("https://ipapi.co/json/", timeout=5) as r:
            data = json.loads(r.read())
            return data.get("country_code", "IE")  # fallback to IE if it fails
    except Exception:
        return "IE"


ZONE = get_zone()  # grid zone — change to match device location


def parse_mwh(value: str) -> float | None:
    """Parse '32,650 mWh' → 32650.0. Returns None for '-' or missing."""
    if not value or value.strip() == "-":
        return None
    cleaned = value.replace(",", "").replace("mWh", "").strip()
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_duration(value: str) -> int:
    """Parse 'H:MM:SS' → total seconds."""
    if not value or value.strip() == "-":
        return 0
    parts = value.strip().split(":")
    try:
        h, m, s = int(parts[0]), int(parts[1]), int(parts[2])
        return h * 3600 + m * 60 + s
    except (ValueError, IndexError):
        return 0


def resolve_timestamps(rows: list[dict]) -> list[dict]:
    """
    battery_usage rows mix full datetimes ('2026-02-21 10:14:45')
    and time-only strings ('10:51:47'). Carry forward the last known
    date to fill in time-only rows.
    """
    resolved = []
    current_date: date | None = None

    for row in rows:
        raw = row["start_time"].strip()
        try:
            dt = datetime.strptime(raw, "%Y-%m-%d %H:%M:%S")
            current_date = dt.date()
        except ValueError:
            if current_date is None:
                print(f"  ⚠ Skipping row with no resolvable date: {raw}")
                continue
            dt = datetime.strptime(f"{current_date} {raw}", "%Y-%m-%d %H:%M:%S")

        resolved.append({**row, "resolved_dt": dt})

    return resolved


def calculate_emissions(kwh: float, intensity: float | None) -> float | None:
    if intensity is None:
        return None
    return round(kwh * intensity / 1000, 6)


# ── main ──────────────────────────────────────────────────────────────────────


def main():
    if not os.path.exists(INPUT_PATH):
        print(f"❌ Input not found: {INPUT_PATH}")
        print("   Run dataGrabber.py first.")
        return

    with open(INPUT_PATH, "r") as f:
        all_rows = [json.loads(line) for line in f if line.strip()]

    # Device identity from system_info row
    system_info = next((r for r in all_rows if r["section"] == "system_info"), {})
    computer_name = system_info.get("COMPUTER NAME", "unknown")
    product_name = system_info.get("SYSTEM PRODUCT NAME", "unknown")
    device_id = f"{computer_name}_{product_name}".replace(" ", "_").upper()

    # Transform battery_usage rows
    usage_rows = [r for r in all_rows if r["section"] == "battery_usage"]
    resolved_rows = resolve_timestamps(usage_rows)

    metrics = []
    skipped = 0

    for row in resolved_rows:
        energy_mwh = parse_mwh(row.get("energy_drained_mwh", "-"))

        if energy_mwh is None:
            skipped += 1
            continue

        metrics.append(
            {
                "org_id": ORG_ID,
                "user_id": USER_ID,
                "device_id": device_id,
                "start_time": row["resolved_dt"].isoformat(),
                "state": row.get("state", ""),
                "duration_seconds": parse_duration(row.get("duration", "0:00:00")),
                "energy_drained_mwh": energy_mwh,
                "zone": ZONE,
            }
        )

    os.makedirs(DATA_DIR, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        for m in metrics:
            f.write(json.dumps(m) + "\n")

    print(f"\n✅ Done.")
    print(f"   org_id: {ORG_ID}")
    print(f"   User ID: {USER_ID}")
    print(f"   Device:                     {device_id}")
    print(f"   Input rows (battery_usage): {len(usage_rows)}")
    print(f"   Skipped (no energy data):   {skipped}")
    print(f"   Metrics written:            {len(metrics)}")
    print(f"   Output:                     {OUTPUT_PATH}")

    print("\n── Sample output (first 3 rows) ──")
    for m in metrics[:1]:
        print(json.dumps(m, indent=2))


if __name__ == "__main__":
    main()

import json
import subprocess
import platform
from bs4 import BeautifulSoup
import os

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(OUTPUT_DIR, exist_ok=True)
OUTPUT_PATH = os.path.join(OUTPUT_DIR, "battery_data.jsonl")


def get_paths():
    system = platform.system()
    if system == "Linux":  # WSL
        return {
            "windows_output": "C:\\Users\\Public\\battery.html",
            "read_path": "/mnt/c/Users/Public/battery.html",
        }
    elif system == "Windows":
        return {
            "windows_output": "C:\\Users\\Public\\battery.html",
            "read_path": "C:\\Users\\Public\\battery.html",
        }
    return None


def get_battery_report():
    paths = get_paths()
    if paths is None:
        print("Unsupported OS")
        return None

    if platform.system() == "Linux":
        subprocess.run(
            [
                "cmd.exe",
                "/c",
                f"powercfg /batteryreport /output {paths['windows_output']}",
            ]
        )
    else:
        subprocess.run(
            ["powercfg", "/batteryreport", "/output", paths["windows_output"]]
        )

    with open(paths["read_path"], "r", encoding="utf-8-sig") as f:
        return f.read()


def parse_system_info(soup):
    """Table 0 — device name, OS etc."""
    table = soup.find_all("table")[0]
    info = {}
    for row in table.find_all("tr"):
        cols = row.find_all("td")
        if len(cols) == 2:
            info[cols[0].text.strip()] = cols[1].text.strip()
    return info


def parse_battery_info(soup):
    """Table 1 — battery name, chemistry, capacity."""
    table = soup.find_all("table")[1]
    info = {}
    for row in table.find_all("tr"):
        cols = row.find_all("td")
        if len(cols) == 2:
            info[cols[0].text.strip()] = cols[1].text.strip()
    return info


def parse_recent_usage(soup):
    """Table 2 — recent usage with timestamps, state, capacity remaining."""
    table = soup.find_all("table")[2]
    rows = []
    for row in table.find_all("tr")[1:]:  # skip header
        cols = [td.text.strip() for td in row.find_all("td")]
        if len(cols) >= 4:
            rows.append(
                {
                    "start_time": cols[0],
                    "state": cols[1],
                    "source": cols[2],
                    "capacity_remaining_pct": cols[3],
                    "capacity_remaining_mwh": cols[4] if len(cols) > 4 else None,
                }
            )
    return rows


def parse_battery_usage(soup):
    """Table 3 — energy drained per session."""
    table = soup.find_all("table")[3]
    rows = []
    for row in table.find_all("tr")[1:]:  # skip header
        cols = [td.text.strip() for td in row.find_all("td")]
        if len(cols) >= 4:
            rows.append(
                {
                    "start_time": cols[0],
                    "state": cols[1],
                    "duration": cols[2],
                    "energy_drained_pct": cols[3],
                    "energy_drained_mwh": cols[4] if len(cols) > 4 else None,
                }
            )
    return rows


def parse_capacity_history(soup):
    """Table 5 — battery capacity over time (health tracking)."""
    table = soup.find_all("table")[5]
    rows = []
    for row in table.find_all("tr")[1:]:
        cols = [td.text.strip() for td in row.find_all("td")]
        if len(cols) >= 3 and cols[0]:
            rows.append(
                {
                    "start_time": cols[0],
                    "full_charge_capacity_mwh": cols[1],
                    "design_capacity_mwh": cols[2],
                }
            )
    return rows


def to_jsonl(data: dict, output_path: str):
    with open(output_path, "w") as f:
        for key, value in data.items():
            if isinstance(value, list):
                for item in value:
                    f.write(json.dumps({"section": key, **item}) + "\n")
            else:
                f.write(json.dumps({"section": key, **value}) + "\n")


def main():
    html = get_battery_report()
    if not html:
        return

    soup = BeautifulSoup(html, "html.parser")

    data = {
        "system_info": parse_system_info(soup),
        "battery_info": parse_battery_info(soup),
        "recent_usage": parse_recent_usage(soup),
        "battery_usage": parse_battery_usage(soup),
        "capacity_history": parse_capacity_history(soup),
    }

    to_jsonl(data, OUTPUT_PATH)
    print("Done — battery_data.jsonl written")

    # Preview
    with open(OUTPUT_PATH) as f:
        for i, line in enumerate(f):
            print(line.strip())
            if i > 8:
                print("...")
                break


if __name__ == "__main__":
    main()

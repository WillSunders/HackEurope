import urllib.request
import urllib.error
import os

API_URL = "http://localhost:3000/api/metrics/ingest"

DATA_DIR = os.environ.get(
    "CARBON_TRACKER_DATA_DIR", os.path.join(os.path.dirname(__file__), "data")
)
METRICS_PATH = os.path.join(DATA_DIR, "metrics.jsonl")


def upload():
    if not os.path.exists(METRICS_PATH):
        print("❌ metrics.jsonl not found")
        return

    with open(METRICS_PATH, "r") as f:
        body = f.read().encode("utf-8")

    req = urllib.request.Request(
        API_URL, data=body, headers={"Content-Type": "text/plain"}, method="POST"
    )

    try:
        with urllib.request.urlopen(req) as r:
            print(f"✅ Uploaded → {r.read().decode()}")
    except urllib.error.HTTPError as e:
        print(f"❌ Upload failed: {e.read().decode()}")


if __name__ == "__main__":
    upload()


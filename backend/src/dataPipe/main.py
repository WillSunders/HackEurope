import sys
import os

# Set DATA_DIR before importing anything else
if getattr(sys, "frozen", False):
    DATA_DIR = os.path.join(os.environ["LOCALAPPDATA"], "CarbonTracker")
else:
    DATA_DIR = os.path.join(os.path.dirname(__file__), "dataPipe", "data")

os.environ["CARBON_TRACKER_DATA_DIR"] = DATA_DIR
os.makedirs(DATA_DIR, exist_ok=True)

# Import AFTER env var is set
from dataGrabber import main as grab
from dataTransformer import main as transform
from taskScheduler import schedule
from dataUploader import upload

if __name__ == "__main__":
    schedule()
    grab()
    transform()
    upload()

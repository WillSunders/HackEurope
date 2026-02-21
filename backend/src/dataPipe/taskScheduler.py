import subprocess
import sys

TASK_NAME = "CarbonTracker"
CREATE_NO_WINDOW = 0x08000000


def is_scheduled():
    result = subprocess.run(
        ["schtasks", "/query", "/tn", TASK_NAME],
        capture_output=True,
        creationflags=CREATE_NO_WINDOW,
    )
    return result.returncode == 0


def schedule():
    if is_scheduled():
        return

    exe_path = sys.executable if getattr(sys, "frozen", False) else __file__

    subprocess.run(
        [
            "schtasks",
            "/create",
            "/tn",
            TASK_NAME,
            "/tr",
            exe_path,
            "/sc",
            "hourly",
            "/f",
        ],
        capture_output=True,
        creationflags=CREATE_NO_WINDOW,
    )
    print(f"✅ Scheduled to run hourly")


if __name__ == "__main__":
    schedule()


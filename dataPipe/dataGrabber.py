import platform
import subprocess
import platform
import os


## Gets paths based on system to be used with get battery report
def get_paths():
    system = platform.system()
    if system == "Linux":  # WSL
        return {
            "windows_output": "C:\\Users\\Public\\battery.html",
            "wsl_read": "/mnt/c/Users/Public/battery.html",
        }
    elif system == "Windows":
        return {
            "windows_output": "C:\\Users\\Public\\battery.html",
            "wsl_read": "C:\\Users\\Public\\battery.html",
        }
    else:
        return None


## Returns battery report via subprocess and a cli command
def get_battery_report():
    paths = get_paths()
    if paths is None:
        print("Unsupported OS")
        return None

    system = platform.system()
    if system == "Linux":
        subprocess.run(
            [
                "cmd.exe",
                "/c",
                f"powercfg /batteryreport /output {paths['windows_output']}",
            ]
        )
    elif system == "Windows":
        subprocess.run(
            ["powercfg", "/batteryreport", "/output", paths["windows_output"]]
        )

    with open(paths["wsl_read"], "r") as f:
        return f.read()


report = []
report = get_battery_report()
print(report[:500])

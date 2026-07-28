import os
import subprocess
import time
import psutil
import urllib.request
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

print("--- 1. STOPPING 9ROUTER NODE PROCESSES ---")
try:
    ps_cmd = (
        "Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | "
        "Where-Object { $_.CommandLine -like '*node_modules\\9router\\*' } | "
        "ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host 'Killed process' $_.ProcessId }"
    )
    subprocess.run(["powershell", "-Command", ps_cmd], capture_output=True)
    print("✓ Stopped 9router Node processes.")
except Exception as e:
    print(f"✗ Error stopping 9router: {e}")

print("\n--- 2. LAUNCHING 9ROUTER DAEMON ---")
try:
    restart_script = r"C:\Users\Linh\AppData\Roaming\9router\daemon\restart_daemon.ps1"
    subprocess.run(["powershell", "-File", restart_script], capture_output=True)
    print("✓ Sent restart command to 9router daemon.")
except Exception as e:
    print(f"✗ Error starting 9router daemon: {e}")

# Wait up to 10 seconds for 9router to start
print("Waiting for 9router to boot up...")
for attempt in range(1, 6):
    try:
        req = urllib.request.Request("http://127.0.0.1:53220/v1/models")
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status == 200:
                data = json.loads(response.read().decode('utf-8'))
                models = [m.get("id") for m in data.get("data", [])]
                print(f"✓ 9router is online! Found combos: {[m for m in models if 'gpt-5.6' in m]}")
                break
    except Exception as e:
        print(f"  Attempt {attempt}: 9router not ready yet...")
        time.sleep(2)

print("\n--- 3. RESTARTING CODEX ---")
killed_count = 0
for proc in psutil.process_iter(['pid', 'name']):
    try:
        name = proc.info['name']
        if name and name.lower() in ['codex.exe']:
            proc.kill()
            killed_count += 1
    except Exception as e:
        pass
print(f"✓ Stopped {killed_count} Codex processes.")
time.sleep(2)

try:
    app_id = "OpenAI.Codex_2p2nqsd0c76g0!App"
    subprocess.run(["cmd", "/c", f"start explorer.exe shell:AppsFolder\\{app_id}"], shell=True)
    print("✓ Sent start command to Codex.")
except Exception as e:
    print(f"✗ Failed to start Codex: {e}")

print("\nAll restarts finished.")

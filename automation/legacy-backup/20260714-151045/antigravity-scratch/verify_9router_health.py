import urllib.request
import json
import time
import sys

sys.stdout.reconfigure(encoding='utf-8')

url = "http://127.0.0.1:53220/v1/models"
print(f"Verifying 9router health and models at {url}...")

# Wait up to 10 seconds for it to start
for attempt in range(1, 6):
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status == 200:
                data = json.loads(response.read().decode('utf-8'))
                models = data.get("models", [])
                print(f"✓ 9router is online! Total models returned: {len(models)}")
                
                # Check for our new models
                target_models = ["cx/gpt-5.6-terra", "cx/gpt-5.6-luna", "cx/gpt-5.6-sol"]
                found_targets = []
                for m in models:
                    model_id = m.get("id") or m.get("fullModel")
                    if model_id in target_models:
                        found_targets.append(model_id)
                        
                print("\nNew models verification:")
                for tm in target_models:
                    status = "✓ FOUND" if tm in found_targets else "✗ NOT FOUND"
                    print(f" - {tm}: {status}")
                sys.exit(0)
    except Exception as e:
        print(f"Attempt {attempt}: 9router not ready yet... ({e})")
        time.sleep(2)

print("✗ Timeout waiting for 9router to become ready.")
sys.exit(1)

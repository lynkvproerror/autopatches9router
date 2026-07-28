import urllib.request
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

url = "http://127.0.0.1:53220/v1/models"
try:
    with urllib.request.urlopen(url, timeout=5) as response:
        data = json.loads(response.read().decode('utf-8'))
        models = data.get("data", [])
        
        print("Models with 'cx/' prefix in 9router response:")
        for m in models:
            m_id = m.get("id")
            if m_id.startswith("cx/"):
                print(f" - {m_id} (owned_by: {m.get('owned_by')})")
                
        print("\nModels with 'combo' owned_by:")
        for m in models:
            if m.get("owned_by") == "combo":
                print(f" - {m.get('id')}")
except Exception as e:
    print(f"Error: {e}")

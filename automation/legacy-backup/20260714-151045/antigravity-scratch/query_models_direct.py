import urllib.request
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

url = "http://127.0.0.1:53220/v1/models"
try:
    with urllib.request.urlopen(url, timeout=5) as response:
        content = response.read().decode('utf-8')
        print("Raw Response:")
        print(content)
except Exception as e:
    print(f"Error: {e}")

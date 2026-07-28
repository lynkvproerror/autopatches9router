import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

chunk_path = r"C:\Users\Linh\AppData\Roaming\npm\node_modules\9router\app\.next-cli-build\server\chunks\2280.js"

try:
    with open(chunk_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    # Search for combo provider definition or combo models list
    pos = content.find('id:"combo"')
    if pos == -1:
        pos = content.find('alias:"combo"')
    if pos == -1:
        pos = content.find('"combo"')
        
    if pos != -1:
        print("Found combo provider context:")
        print(content[max(0, pos - 200):pos + 2000])
    else:
        print("Combo provider not found by id/alias/provider in 2280.js")
except Exception as e:
    print(f"Error: {e}")

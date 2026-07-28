import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

chunk_path = r"C:\Users\Linh\AppData\Roaming\npm\node_modules\9router\app\.next-cli-build\static\chunks\1321-1142815a02c93f63.js"

if not os.path.exists(chunk_path):
    print("Static chunk does not exist")
    sys.exit(0)
    
try:
    with open(chunk_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    search_term = "gpt-5.2-codex"
    pos = content.find(search_term)
    if pos != -1:
        start = max(0, pos - 200)
        end = min(len(content), pos + 1200)
        print("Found snippet in static chunk:")
        print(content[start:end])
    else:
        print("Search term not found in static chunk")
except Exception as e:
    print(f"Error: {e}")

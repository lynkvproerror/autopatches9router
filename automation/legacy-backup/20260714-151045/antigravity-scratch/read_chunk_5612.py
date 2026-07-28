import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

chunk_path = r"C:\Users\Linh\AppData\Roaming\npm\node_modules\9router\app\.next-cli-build\server\chunks\5612.js"

if not os.path.exists(chunk_path):
    print("5612.js does not exist")
    sys.exit(0)
    
try:
    with open(chunk_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    search_term = "Could not fetch combos"
    pos = content.find(search_term)
    if pos != -1:
        start = max(0, pos - 200)
        end = min(len(content), pos + 3000)
        print("Found snippet in 5612.js:")
        print(content[start:end])
    else:
        print("Search term not found in 5612.js")
except Exception as e:
    print(f"Error: {e}")

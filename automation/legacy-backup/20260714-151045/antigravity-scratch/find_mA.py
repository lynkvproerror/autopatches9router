import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

chunk_path = r"C:\Users\Linh\AppData\Roaming\npm\node_modules\9router\app\.next-cli-build\server\chunks\6070.js"
if not os.path.exists(chunk_path):
    chunk_path = r"C:\Users\Linh\AppData\Roaming\npm\node_modules\9router\app\.next-cli-build\server\chunks\2280.js"

try:
    with open(chunk_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    pos = content.find("mA:")
    if pos == -1:
        pos = content.find("mA=")
    if pos == -1:
        # Search for export of mA in chunk exports
        # vq, B$, etc.
        pos = content.find("mA")
        
    if pos != -1:
        print("Found context for mA:")
        print(content[max(0, pos - 200):pos + 1200])
    else:
        print("mA not found in chunk")
except Exception as e:
    print(f"Error: {e}")

import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

route_path = r"C:\Users\Linh\AppData\Roaming\npm\node_modules\9router\app\.next-cli-build\server\app\api\models\route.js"

if not os.path.exists(route_path):
    print("Route file does not exist")
    sys.exit(0)
    
try:
    with open(route_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    print(f"File size: {len(content)} bytes")
    # Print the first 2000 chars of the file to see how it operates
    print(content[:2000])
except Exception as e:
    print(f"Error: {e}")

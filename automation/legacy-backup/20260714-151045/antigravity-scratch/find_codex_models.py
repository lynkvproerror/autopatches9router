import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

chunk_path = r"C:\Users\Linh\AppData\Roaming\npm\node_modules\9router\app\.next-cli-build\server\chunks\2280.js"

try:
    with open(chunk_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    pos = content.find('id:"codex"')
    if pos != -1:
        # Find "models:[" following id:"codex"
        models_pos = content.find("models:[", pos)
        if models_pos != -1:
            end_pos = content.find("]", models_pos)
            print("Found codex models array:")
            print(content[models_pos:end_pos+1])
        else:
            print("models:[ not found after id:\"codex\"")
    else:
        print("id:\"codex\" not found")
except Exception as e:
    print(f"Error: {e}")

import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

chunk_paths = [
    ("Server chunk", r"C:\Users\Linh\AppData\Roaming\npm\node_modules\9router\app\.next-cli-build\server\chunks\2280.js"),
]

for label, path in chunk_paths:
    print(f"\n=== {label}: {path} ===")
    if not os.path.exists(path):
        print("Does not exist.")
        continue
    try:
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        pos = content.find("gpt-5.2-codex")
        if pos != -1:
            start_arr = content.rfind("[", 0, pos)
            # Print 1000 chars before start_arr
            print("Before array:")
            print(content[max(0, start_arr - 1200):start_arr])
    except Exception as e:
        print(f"Error: {e}")

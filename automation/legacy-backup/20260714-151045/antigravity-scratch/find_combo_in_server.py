import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

search_dir = r"C:\Users\Linh\AppData\Roaming\npm\node_modules\9router\app\.next-cli-build\server"
search_term = "combo"

print(f"Searching for '{search_term}' in server build...")

for root, dirs, files in os.walk(search_dir):
    for file in files:
        if file.endswith('.js'):
            path = os.path.join(root, file)
            try:
                with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                    if search_term in content.lower():
                        pos = content.lower().find(search_term)
                        print(f"Found in: {os.path.relpath(path, search_dir)}")
                        print("Context:")
                        print(content[max(0, pos - 150):pos + 800])
                        print("-" * 50)
            except Exception as e:
                pass
                
print("Search finished.")

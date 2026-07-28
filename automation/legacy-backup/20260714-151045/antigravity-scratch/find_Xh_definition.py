import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

search_dir = r"C:\Users\Linh\AppData\Roaming\npm\node_modules\9router\app\.next-cli-build\server"
search_term = "Xh:"

print(f"Searching for '{search_term}'...")

for root, dirs, files in os.walk(search_dir):
    for file in files:
        if file.endswith('.js'):
            path = os.path.join(root, file)
            try:
                with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                    if search_term in content:
                        print(f"Found in: {os.path.relpath(path, search_dir)}")
                        pos = content.find(search_term)
                        print(content[max(0, pos - 100):pos + 800])
                        print("-" * 50)
            except Exception as e:
                pass
                
print("Search finished.")

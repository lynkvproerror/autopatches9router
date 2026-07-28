import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

search_dir = r"C:\Users\Linh\AppData\Roaming\npm\node_modules\9router"
search_term = "PROVIDER_MODELS"

print(f"Searching for '{search_term}' in {search_dir} (excluding compiled folders)...")

for root, dirs, files in os.walk(search_dir):
    for d in list(dirs):
        if d in ['node_modules', '.git', '.next-cli-build', 'logs', 'dist', 'build']:
            dirs.remove(d)
            
    for file in files:
        if file.endswith(('.js', '.json', '.ts', '.tsx', '.py', '.txt')):
            path = os.path.join(root, file)
            try:
                with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                    for line_num, line in enumerate(f, 1):
                        if search_term in line:
                            rel = os.path.relpath(path, search_dir)
                            print(f"Found in {rel} (Line {line_num}): {line.strip()[:120]}")
            except Exception as e:
                pass
                
print("Search finished.")

import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

src_dir = r"C:\Users\Linh\AppData\Roaming\npm\node_modules\9router\app\src"

print(f"Listing all files in {src_dir} recursively:")
for root, dirs, files in os.walk(src_dir):
    for file in files:
        rel = os.path.relpath(os.path.join(root, file), src_dir)
        print(f" - {rel}")

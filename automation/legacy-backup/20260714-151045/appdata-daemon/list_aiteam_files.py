# list_aiteam_files.py
import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

aiteam_dir = r"D:\Downloads\aiteam"
if os.path.exists(aiteam_dir):
    print(f"Contents of {aiteam_dir}:\n")
    for root, dirs, files in os.walk(aiteam_dir):
        dirs[:] = [d for d in dirs if d not in ('node_modules', '.git', 'venv', '__pycache__')]
        for file in files:
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, aiteam_dir)
            size = os.path.getsize(full_path)
            print(f"  - {rel_path} ({size} bytes)")
else:
    print(f"Directory {aiteam_dir} does not exist.")

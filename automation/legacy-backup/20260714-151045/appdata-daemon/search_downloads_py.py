# search_downloads_py.py
import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

downloads_dir = r"D:\Downloads"
print(f"Scanning {downloads_dir} for Python or YAML/text files related to tools...")

keywords = ["chatgpt", "k12", "register", "sub2api", "outlook", "join", "workspace"]

for root, dirs, files in os.walk(downloads_dir):
    # Skip common noise dirs
    dirs[:] = [d for d in dirs if d not in ('node_modules', '.git', 'venv', '__pycache__', 'AppData')]
    
    for file in files:
        ext = os.path.splitext(file)[1].lower()
        if ext in ('.py', '.yaml', '.yml', '.txt', '.json'):
            # Check if directory name or file name contains keywords
            rel_path = os.path.relpath(os.path.join(root, file), downloads_dir)
            match = False
            for kw in keywords:
                if kw in rel_path.lower():
                    match = True
                    break
            if match:
                full_path = os.path.join(root, file)
                size = os.path.getsize(full_path)
                print(f"  - {rel_path} ({size} bytes)")

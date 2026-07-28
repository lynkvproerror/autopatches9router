# list_tool_files.py
import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

base_dirs = [
    r"D:\Downloads\chatgpt-k12-tools",
    r"C:\Users\Linh\AppData\Roaming\9router"
]

print("Scanning for Python and data files in tool directories...\n")

for base_dir in base_dirs:
    if not os.path.exists(base_dir):
        print(f"Directory does not exist: {base_dir}")
        continue
        
    print(f"=== Directory: {base_dir} ===")
    for root, dirs, files in os.walk(base_dir):
        # Exclude node_modules, .git, venv
        dirs[:] = [d for d in dirs if d not in ('node_modules', '.git', 'venv', '__pycache__')]
        
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in ('.py', '.json', '.yaml', '.yml', '.txt', '.sqlite', '.db', '.js', '.html', '.css'):
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, base_dir)
                size = os.path.getsize(full_path)
                print(f"  - {rel_path} ({size} bytes)")
    print()

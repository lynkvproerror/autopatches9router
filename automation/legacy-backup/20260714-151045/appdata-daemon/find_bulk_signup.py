# find_bulk_signup.py
import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

search_paths = [
    r"D:\Downloads",
    r"D:\Music",
    r"C:\Users\Linh\AppData\Roaming\9router",
    r"C:\Users\Linh\.gemini\antigravity"
]

print("Searching for files named 'bulk_signup.py' or similar in tool folders...\n")

for path in search_paths:
    if os.path.exists(path):
        for root, dirs, files in os.walk(path):
            dirs[:] = [d for d in dirs if d not in ('node_modules', '.git', 'venv', '__pycache__')]
            for file in files:
                if "bulk" in file.lower() or "signup" in file.lower() or "dot" in file.lower():
                    full_path = os.path.join(root, file)
                    print(f"Found match: {full_path} ({os.path.getsize(full_path)} bytes)")

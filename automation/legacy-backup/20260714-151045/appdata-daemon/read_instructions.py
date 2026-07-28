# read_instructions.py
import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

aiteam_dir = r"D:\Downloads\aiteam"

files_to_read = [
    ("指令.txt", 10),
    ("ChatGPT成员邮箱导出说明.md", 150)
]

for filename, max_lines in files_to_read:
    filepath = os.path.join(aiteam_dir, filename)
    if os.path.exists(filepath):
        print(f"=== {filename} ===")
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            for idx, line in enumerate(f):
                if idx >= max_lines:
                    break
                print(line.rstrip())
        print()
    else:
        print(f"{filename} not found.")

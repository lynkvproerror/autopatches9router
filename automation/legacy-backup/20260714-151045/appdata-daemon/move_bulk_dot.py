# move_bulk_dot.py
import os
import shutil
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

src_dir = r"C:\Users\Linh\.gemini\antigravity\brain\d0e4cb66-fa41-4dcb-898c-a0efd69ae11b\scratch"
dest_dir = r"D:\Music\Ruby\Produce for Customer\Tools\ChatGPT\TẠO TÀI KHOẢN\reg chatgpt\Tài Liệu\4. Tool Reg Google Dot"

print(f"Creating directory: {dest_dir}")
os.makedirs(dest_dir, exist_ok=True)

files_to_copy = [
    "bulk_signup.py",
    "gmail_dot_generator.py"
]

for file in files_to_copy:
    src_path = os.path.join(src_dir, file)
    dest_path = os.path.join(dest_dir, file)
    if os.path.exists(src_path):
        shutil.copy2(src_path, dest_path)
        print(f"Copied '{file}' to '{dest_dir}'")
    else:
        print(f"File '{file}' not found in source directory.")

# move_extensions.py
import os
import shutil
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

src_dir = r"D:\Downloads\chatgpt-k12-tools"
dest_dir = r"D:\Music\Ruby\Produce for Customer\Tools\ChatGPT\TẠO TÀI KHOẢN\reg chatgpt\Tài Liệu\3. Chrome Extension K12 Tools"

print(f"Source directory: {src_dir}")
print(f"Destination directory: {dest_dir}\n")

if not os.path.exists(src_dir):
    print("Source directory does not exist!")
    sys.exit(1)

try:
    if os.path.exists(dest_dir):
        if os.path.isdir(dest_dir):
            shutil.rmtree(dest_dir)
        else:
            os.remove(dest_dir)
            
    shutil.move(src_dir, dest_dir)
    print("Chrome Extension folder moved successfully!")
except Exception as e:
    print(f"Error moving Chrome Extension folder: {e}")
    sys.exit(1)

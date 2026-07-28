# move_aiteam.py
import os
import shutil
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

src_dir = r"D:\Downloads\aiteam"
dest_dir = r"D:\Music\Ruby\Produce for Customer\Tools\ChatGPT\TẠO TÀI KHOẢN\reg chatgpt\Tài Liệu"

print(f"Source directory: {src_dir}")
print(f"Destination directory: {dest_dir}\n")

if not os.path.exists(src_dir):
    print("Source directory does not exist!")
    sys.exit(1)

# Create destination directory if it doesn't exist
try:
    os.makedirs(dest_dir, exist_ok=True)
    print(f"Verified destination directory exists: {dest_dir}")
except Exception as e:
    print(f"Error creating destination directory: {e}")
    sys.exit(1)

# Move all items in source to destination
success_count = 0
fail_count = 0

for item in os.listdir(src_dir):
    src_path = os.path.join(src_dir, item)
    dest_path = os.path.join(dest_dir, item)
    
    try:
        if os.path.exists(dest_path):
            # If destination exists, remove it first to avoid collision
            if os.path.isdir(dest_path):
                shutil.rmtree(dest_path)
            else:
                os.remove(dest_path)
        
        shutil.move(src_path, dest_path)
        print(f"Moved: {item}")
        success_count += 1
    except Exception as e:
        print(f"Failed to move {item}: {e}")
        fail_count += 1

print(f"\nMove completed: {success_count} success, {fail_count} failed.")

# Clean up source directory if it is empty
try:
    if len(os.listdir(src_dir)) == 0:
        os.rmdir(src_dir)
        print(f"Removed empty source directory: {src_dir}")
except Exception as e:
    pass

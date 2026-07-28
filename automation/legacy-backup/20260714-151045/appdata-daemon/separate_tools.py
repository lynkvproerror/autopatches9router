# separate_tools.py
import os
import shutil
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

base_dir = r"D:\Music\Ruby\Produce for Customer\Tools\ChatGPT\TẠO TÀI KHOẢN\reg chatgpt\Tài Liệu"

# Define destination subfolders
tool_reg_dir = os.path.join(base_dir, "1. Tool Reg Acc và Token")
tool_export_dir = os.path.join(base_dir, "2. Tool Xuất Thành Viên Workspace")

print(f"Base folder: {base_dir}")
print(f"Creating separate tool folders:")
print(f"  - {tool_reg_dir}")
print(f"  - {tool_export_dir}\n")

os.makedirs(tool_reg_dir, exist_ok=True)
os.makedirs(tool_export_dir, exist_ok=True)

# List of files for Tool 1 (Reg Acc)
reg_files = [
    "aiteam.py",
    "aiteam.json",
    "members.txt",
    "register_only_failed.txt",
    "指令.txt",
    "chatgpt_sessions",
    "codex_tokens"
]

# List of files for Tool 2 (Export Members)
export_files = [
    "export_chatgpt_members.py",
    "ChatGPT成员邮箱导出说明.md",
    "exports"
]

# Function to safely move files/directories
def move_item(item, dest_folder):
    src_path = os.path.join(base_dir, item)
    dest_path = os.path.join(dest_folder, item)
    
    if os.path.exists(src_path):
        try:
            if os.path.exists(dest_path):
                if os.path.isdir(dest_path):
                    shutil.rmtree(dest_path)
                else:
                    os.remove(dest_path)
            shutil.move(src_path, dest_path)
            print(f"Moved '{item}' to '{os.path.basename(dest_folder)}'")
        except Exception as e:
            print(f"Failed to move '{item}': {e}")
    else:
        print(f"Item '{item}' not found in base folder.")

print("Moving Tool 1 (Reg Acc) files:")
for item in reg_files:
    move_item(item, tool_reg_dir)

print("\nMoving Tool 2 (Export Members) files:")
for item in export_files:
    move_item(item, tool_export_dir)

# Handle residual files like empty "python" folder
python_folder = os.path.join(base_dir, "python")
if os.path.exists(python_folder):
    try:
        if os.path.isdir(python_folder):
            os.rmdir(python_folder)
        else:
            os.remove(python_folder)
        print("\nCleaned up residual 'python' item.")
    except Exception:
        pass

print("\nSeparation completed successfully!")

# inspect_aiteam.py
import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

aiteam_dir = r"D:\Downloads\aiteam"
print("Files directly in aiteam directory:")
for entry in os.listdir(aiteam_dir):
    full_path = os.path.join(aiteam_dir, entry)
    if os.path.isfile(full_path):
        try:
            print(f"  - {entry} ({os.path.getsize(full_path)} bytes)")
        except Exception as e:
            print(f"  - (unicode error file name): {e}")

script_path = os.path.join(aiteam_dir, "aiteam.py")
if os.path.exists(script_path):
    print(f"\nFirst 150 lines of {script_path}:\n")
    with open(script_path, 'r', encoding='utf-8', errors='ignore') as f:
        for idx in range(150):
            line = f.readline()
            if not line:
                break
            print(f"{idx+1:02d}: {line.rstrip()}")

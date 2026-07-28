# parse_log.py
import re

log_path = r"C:\Users\Linh\.gemini\antigravity\brain\ccbc54e6-6e4c-4398-bc19-6ba16b63fe56\.system_generated\tasks\task-1042.log"
with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

print(f"Total lines in log: {len(lines)}")
print("Filtering for tool files:\n")

excluded_patterns = [
    r"aiteam\\exports", 
    r"Ballad Han Quoc", 
    r"\.venv", 
    r"G-Labs\.Automation", 
    r"ChatGptAdminCsv\\obj",
    r"ChatGptAdminCsv\\bin"
]

for line in lines:
    line = line.strip()
    if line.startswith("- "):
        # Check exclusions
        skip = False
        for pattern in excluded_patterns:
            if re.search(pattern, line):
                skip = True
                break
        if not skip:
            print(line)

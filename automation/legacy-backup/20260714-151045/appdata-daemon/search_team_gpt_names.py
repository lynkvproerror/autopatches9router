# search_team_gpt_names.py
import os
import json
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

log_file = r"C:\Users\Linh\.gemini\antigravity\brain\d0e4cb66-fa41-4dcb-898c-a0efd69ae11b\.system_generated\logs\transcript_full.jsonl"
if not os.path.exists(log_file):
    log_file = r"C:\Users\Linh\.gemini\antigravity\brain\d0e4cb66-fa41-4dcb-898c-a0efd69ae11b\.system_generated\logs\transcript.jsonl"

with open(log_file, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

for idx, line in enumerate(lines, 1):
    if "Team-K12" in line or "GPT PRO" in line:
        print(f"\n=================== MATCH AT LINE {idx} ===================")
        # Print 3 lines before and after
        start = max(0, idx - 4)
        end = min(len(lines), idx + 3)
        for i in range(start, end):
            try:
                data = json.loads(lines[i])
                content = data.get("content", "")
                role = data.get("source", "UNKNOWN")
                print(f"[{i+1}] {role}: {content[:500]}")
                print("-" * 30)
            except:
                print(f"[{i+1}] RAW: {lines[i][:500]}")
                print("-" * 30)

# get_deactivated_uuids.py
import os
import json
import re
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

log_file = r"C:\Users\Linh\.gemini\antigravity\brain\d0e4cb66-fa41-4dcb-898c-a0efd69ae11b\.system_generated\logs\transcript_full.jsonl"
if not os.path.exists(log_file):
    log_file = r"C:\Users\Linh\.gemini\antigravity\brain\d0e4cb66-fa41-4dcb-898c-a0efd69ae11b\.system_generated\logs\transcript.jsonl"

target_uuids = [
    "eb6642e8-b4a6-4652-9c18-67099f2781cc",
    "5e4c9b31-1b4e-4887-839b-607597928d7c",
    "631e1603-06cf-4f0b-b79b-d09fbfcfe98d",
    "ca0e29ed-a54c-42d9-a50b-2ba5e065296d"
]

with open(log_file, 'r', encoding='utf-8', errors='ignore') as f:
    for idx, line in enumerate(f, 1):
        for uuid in target_uuids:
            if uuid in line:
                try:
                    data = json.loads(line)
                    content = data.get("content", "")
                    # Print context around the UUID
                    print(f"\n--- Line {idx} | Found UUID {uuid} ---")
                    uuid_pos = content.find(uuid)
                    start = max(0, uuid_pos - 150)
                    end = min(len(content), uuid_pos + 350)
                    print(f"... {content[start:end]} ...")
                except Exception as e:
                    # Safe print fallback
                    safe_line = line[:400].encode('utf-8', errors='ignore').decode('utf-8', errors='ignore')
                    print(f"Error parsing line {idx}: {e}")
                    print(safe_line)
                    break

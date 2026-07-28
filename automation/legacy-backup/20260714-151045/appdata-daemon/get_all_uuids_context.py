# get_all_uuids_context.py
import os
import re
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

log_file = r"C:\Users\Linh\.gemini\antigravity\brain\d0e4cb66-fa41-4dcb-898c-a0efd69ae11b\.system_generated\logs\transcript_full.jsonl"
if not os.path.exists(log_file):
    log_file = r"C:\Users\Linh\.gemini\antigravity\brain\d0e4cb66-fa41-4dcb-898c-a0efd69ae11b\.system_generated\logs\transcript.jsonl"

with open(log_file, 'r', encoding='utf-8', errors='ignore') as f:
    for idx, line in enumerate(f, 1):
        if "Team-K12" in line or "GPT PRO" in line or "deactivated" in line.lower():
            # Search for UUIDs in the line
            uuids = re.findall(r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}', line, re.I)
            if uuids:
                # Find matching names in the line text
                name_matches = []
                for term in ["Team-K12", "GPT PRO", "Deactivated"]:
                    if term.lower() in line.lower():
                        name_matches.append(term)
                
                print(f"Line {idx} | UUIDs: {uuids} | Terms: {name_matches}")
                # Print clean context by removing large payloads like access token if present
                clean_line = re.sub(r'eyJhbGciOiJSUzI1NiIsImtpZCI6Ik[^"]+', '[TOKEN]', line)
                print(clean_line[:300])
                print("-" * 50)

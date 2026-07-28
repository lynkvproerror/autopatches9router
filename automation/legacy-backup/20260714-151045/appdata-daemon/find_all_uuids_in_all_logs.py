# find_all_uuids_in_all_logs.py
import os
import re
import json
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

brain_dir = r"C:\Users\Linh\.gemini\antigravity\brain"
uuid_regex = re.compile(r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}', re.IGNORECASE)

print("Starting scan...")
findings = {}

for root, dirs, files in os.walk(brain_dir):
    for file in files:
        if file in ("transcript.jsonl", "transcript_full.jsonl"):
            file_path = os.path.join(root, file)
            try:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    for line_no, line in enumerate(f, 1):
                        uuids = uuid_regex.findall(line)
                        for uuid in uuids:
                            uuid = uuid.lower()
                            # Search for names around the UUID
                            surroundings = []
                            pos = line.lower().find(uuid)
                            if pos != -1:
                                start = max(0, pos - 150)
                                end = min(len(line), pos + len(uuid) + 150)
                                chunk = line[start:end].strip()
                                # Clean token strings
                                chunk = re.sub(r'eyJhbGciOiJSUzI1NiIsImtpZCI6Ik[^"]+', '[TOKEN]', chunk)
                                surroundings.append(chunk)
                            
                            if uuid not in findings:
                                findings[uuid] = []
                            findings[uuid].extend(surroundings)
            except Exception as e:
                pass

print(f"\nScan complete. Found {len(findings)} unique UUIDs:")
for uuid, context_list in findings.items():
    # Filter unique context entries
    unique_contexts = list(set(context_list))
    # We are interested in contexts mentioning "Team", "K12", "GPT", "Deactivated", "Pro", "Outlook"
    relevant_contexts = []
    for c in unique_contexts:
        if any(term in c.lower() for term in ["team", "k12", "gpt", "deactivated", "pro", "outlook", "school", "workspace"]):
            relevant_contexts.append(c)
            
    if relevant_contexts:
        print(f"\nUUID: {uuid}")
        print(f"Total occurrences: {len(context_list)}")
        print("Relevant Context snippets:")
        for idx, rc in enumerate(relevant_contexts[:3]):
            # print first 200 chars of each context snippet
            print(f"  [{idx+1}] {rc[:220]}...")

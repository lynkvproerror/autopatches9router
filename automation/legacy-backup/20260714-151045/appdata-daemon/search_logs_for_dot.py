# search_logs_for_dot.py
import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

brain_dir = r"C:\Users\Linh\.gemini\antigravity\brain"
print("Scanning log transcripts for dot trick references...\n")

keywords = ["dot", "google dot", "gmail dot", "generator", "trick", "cham", "chấm"]

found_matches = []

for root, dirs, files in os.walk(brain_dir):
    for file in files:
        if file.endswith('.jsonl') or file.endswith('.json') or file.endswith('.txt') or file.endswith('.md'):
            filepath = os.path.join(root, file)
            try:
                with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                    for line_no, line in enumerate(f, 1):
                        matched_kws = [kw for kw in keywords if kw in line.lower()]
                        if matched_kws:
                            found_matches.append((filepath, line_no, matched_kws, line.strip()[:200]))
            except Exception:
                pass

print(f"Found {len(found_matches)} matches in logs:")
# Print the first 50 unique matches
printed = set()
for filepath, line_no, kws, line_content in found_matches[:50]:
    rel_path = os.path.relpath(filepath, brain_dir)
    key = (rel_path, line_content)
    if key not in printed:
        print(f"  - {rel_path}:{line_no} (KW: {kws}) -> {line_content}")
        printed.add(key)

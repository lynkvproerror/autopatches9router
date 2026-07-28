# search_all_conversations.py
import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

brain_dir = r"C:\Users\Linh\.gemini\antigravity\brain"
print("Scanning all transcripts for Gmail Dot Trick or Google Dot keywords...\n")

keywords = ["gmail dot", "google dot", "dot trick", "dot_trick", "dot generator", "chấm", "cham gmail"]

found = False

for root, dirs, files in os.walk(brain_dir):
    for file in files:
        if file.endswith('.jsonl'):
            filepath = os.path.join(root, file)
            try:
                with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                    for line_no, line in enumerate(f, 1):
                        for kw in keywords:
                            if kw in line.lower():
                                print(f"Match: {os.path.relpath(filepath, brain_dir)}:{line_no} -> {line.strip()[:180]}...")
                                found = True
                                break
            except Exception:
                pass

if not found:
    print("No matches found for Gmail Dot keywords in previous logs.")

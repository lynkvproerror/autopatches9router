import os
import json

brain_dir = r"C:\Users\Linh\.gemini\antigravity\brain"

print("Searching ALL conversation transcripts for '9router'...")

for root, dirs, files in os.walk(brain_dir):
    for file in files:
        if file == "transcript.jsonl":
            path = os.path.join(root, file)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    for line_num, line in enumerate(f, 1):
                        if "9router" in line.lower():
                            obj = json.loads(line)
                            step = obj.get("step_index")
                            rel_path = os.path.relpath(path, brain_dir)
                            # Print matching text context or tool calls
                            content = obj.get("content", "")
                            if content:
                                snippet = content[:300].replace('\n', ' ')
                                print(f"Found in {rel_path} (Step {step}, line {line_num}):\n  {snippet}...")
                            else:
                                tc_names = [tc.get("name") for tc in obj.get("tool_calls", [])]
                                print(f"Found in {rel_path} (Step {step}, line {line_num}):\n  tools={tc_names}")
            except Exception as e:
                pass
print("Finished search.")

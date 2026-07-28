import re
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

chunk_path = r"C:\Users\Linh\AppData\Roaming\npm\node_modules\9router\app\.next-cli-build\server\chunks\2280.js"

if not os.path.exists(chunk_path):
    print("Chunk not found")
    sys.exit(1)

with open(chunk_path, 'r', encoding='utf-8') as f:
    content = f.read()
    
# Find codex provider section and check for the new models
pos = content.find('id:"codex"')
if pos != -1:
    section = content[pos:pos+2000]
    print("Codex section in 2280.js:")
    for model_id in ["gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.6-sol"]:
        present = model_id in section
        print(f" - {model_id}: {'✓ FOUND' if present else '✗ NOT FOUND'}")
else:
    print("Codex section not found in 2280.js")

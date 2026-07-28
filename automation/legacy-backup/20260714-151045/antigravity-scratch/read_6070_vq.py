import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

chunk_path = r"C:\Users\Linh\AppData\Roaming\npm\node_modules\9router\app\.next-cli-build\server\chunks\6070.js"

if not os.path.exists(chunk_path):
    print("Chunk file does not exist")
    sys.exit(0)
    
try:
    with open(chunk_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    search_term = "vq:"
    pos = content.find(search_term)
    if pos != -1:
        # Search for where q is declared since vq maps to q
        decl_pos = content.find("let q=", pos - 1000)
        if decl_pos == -1:
            decl_pos = content.find("const q=", pos - 1000)
        if decl_pos == -1:
            decl_pos = content.find("q={", pos - 1000)
        if decl_pos == -1:
            decl_pos = pos
            
        start = max(0, decl_pos - 100)
        end = min(len(content), decl_pos + 4000)
        print("Found snippet in 6070.js:")
        print(content[start:end])
    else:
        print("Search term not found in 6070.js")
except Exception as e:
    print(f"Error: {e}")

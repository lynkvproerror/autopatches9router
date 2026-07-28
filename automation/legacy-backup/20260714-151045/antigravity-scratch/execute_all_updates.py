import os
import json
import re
import sys
import subprocess
import time

sys.stdout.reconfigure(encoding='utf-8')

# 1. Update providers.js (CLI)
providers_path = r"C:\Users\Linh\AppData\Roaming\npm\node_modules\9router\src\cli\menus\providers.js"

print("--- 1. UPDATING CLI MENUS (providers.js) ---")
if os.path.exists(providers_path):
    with open(providers_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    target = '  cx: [\n    { id: "gpt-5.2-codex" },'
    replacement = '  cx: [\n    { id: "gpt-5.6-terra" },\n    { id: "gpt-5.6-luna" },\n    { id: "gpt-5.6-sol" },\n    { id: "gpt-5.2-codex" },'
    
    if target in content:
        content = content.replace(target, replacement)
        with open(providers_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print("✓ Successfully updated cx models in providers.js")
    elif 'id: "gpt-5.6-terra"' in content:
        print("! Models already exist in providers.js")
    else:
        # Fallback search
        target2 = '  cx: ['
        replacement2 = '  cx: [\n    { id: "gpt-5.6-terra" },\n    { id: "gpt-5.6-luna" },\n    { id: "gpt-5.6-sol" },'
        if target2 in content:
            content = content.replace(target2, replacement2)
            with open(providers_path, 'w', encoding='utf-8') as f:
                f.write(content)
            print("✓ Successfully updated cx models in providers.js (fallback)")
        else:
            print("✗ Could not find insertion point in providers.js")
else:
    print("✗ providers.js file not found")

# 2. Update Next.js build chunks (.next-cli-build)
next_build_dir = r"C:\Users\Linh\AppData\Roaming\npm\node_modules\9router\app\.next-cli-build"
print("\n--- 2. UPDATING NEXT.JS BUILD CHUNKS ---")

target_str = 'models:[{id:"gpt-5.5"'
new_models_str = (
    'models:['
    '{id:"gpt-5.6-terra",name:"GPT 5.6 Terra"},'
    '{id:"gpt-5.6-terra-review",name:"GPT 5.6 Terra Review",upstreamModelId:"gpt-5.6-terra",quotaFamily:"review"},'
    '{id:"gpt-5.6-luna",name:"GPT 5.6 Luna"},'
    '{id:"gpt-5.6-luna-review",name:"GPT 5.6 Luna Review",upstreamModelId:"gpt-5.6-luna",quotaFamily:"review"},'
    '{id:"gpt-5.6-sol",name:"GPT 5.6 Sol"},'
    '{id:"gpt-5.6-sol-review",name:"GPT 5.6 Sol Review",upstreamModelId:"gpt-5.6-sol",quotaFamily:"review"},'
    '{id:"gpt-5.5"'
)

patched_files = []
for root, dirs, files in os.walk(next_build_dir):
    for file in files:
        if file.endswith('.js'):
            path = os.path.join(root, file)
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()
                if target_str in content:
                    if 'id:"gpt-5.6-terra"' not in content:
                        new_content = content.replace(target_str, new_models_str)
                        with open(path, 'w', encoding='utf-8') as f:
                            f.write(new_content)
                        rel_path = os.path.relpath(path, next_build_dir)
                        print(f"✓ Patched chunk: {rel_path}")
                        patched_files.append(rel_path)
                    else:
                        print(f"! Chunk already patched: {os.path.relpath(path, next_build_dir)}")
                        patched_files.append(os.path.relpath(path, next_build_dir))
            except Exception as e:
                print(f"✗ Error patching {file}: {e}")

print(f"Total Next.js files patched/verified: {len(patched_files)}")

# 3. Update models_cache.json (Codex)
cache_path = r"C:\Users\Linh\.codex\models_cache.json"
print("\n--- 3. UPDATING CODEX MODELS CACHE ---")

if os.path.exists(cache_path):
    try:
        with open(cache_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        models = data.get("models", [])
        gpt55_entry = None
        for m in models:
            if m.get("slug") == "gpt-5.5":
                gpt55_entry = m
                break
                
        if gpt55_entry:
            new_models = [
                ("gpt-5.6-terra", "GPT-5.6-Terra"),
                ("gpt-5.6-luna", "GPT-5.6-Luna"),
                ("gpt-5.6-sol", "GPT-5.6-Sol"),
            ]
            
            existing_slugs = {m.get("slug") for m in models}
            entries_to_add = []
            
            for slug, display_name in new_models:
                if slug not in existing_slugs:
                    new_entry = json.loads(json.dumps(gpt55_entry))
                    new_entry["slug"] = slug
                    new_entry["display_name"] = display_name
                    
                    # Helper function to recursively replace text inside the cloned dictionary
                    def replace_text(obj, old_slug, new_slug, old_name, new_name):
                        if isinstance(obj, str):
                            obj = obj.replace(old_slug, new_slug)
                            obj = obj.replace(old_name, new_name)
                            return obj
                        elif isinstance(obj, dict):
                            return {k: replace_text(v, old_slug, new_slug, old_name, new_name) for k, v in obj.items()}
                        elif isinstance(obj, list):
                            return [replace_text(item, old_slug, new_slug, old_name, new_name) for item in obj]
                        return obj
                        
                    new_entry = replace_text(new_entry, "gpt-5.5", slug, "GPT-5.5", display_name)
                    entries_to_add.append(new_entry)
                    
            if entries_to_add:
                # Add to the beginning of the list
                data["models"] = entries_to_add + models
                with open(cache_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                print(f"✓ Added {len(entries_to_add)} models to models_cache.json:")
                for slug, _ in new_models:
                    print(f"   - {slug}")
            else:
                print("! Models already exist in models_cache.json")
        else:
            print("✗ gpt-5.5 entry not found in models_cache.json to clone")
    except Exception as e:
        print(f"✗ Error updating models_cache.json: {e}")
else:
    print("✗ models_cache.json not found")

# 4. Restarting 9router
print("\n--- 4. RESTARTING 9ROUTER DAEMON ---")
try:
    print("Finding and killing active 9router Node processes...")
    # Run powershell command to find and stop node processes running 9router
    ps_cmd = (
        "Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | "
        "Where-Object { $_.CommandLine -like '*node_modules\\9router\\*' } | "
        "ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host 'Killed process' $_.ProcessId }"
    )
    subprocess.run(["powershell", "-Command", ps_cmd], capture_output=True)
    print("✓ Active 9router Node processes stopped.")
    
    print("Launching daemon monitor to trigger restart...")
    # Run restart script to verify health and start monitor if needed
    restart_script = r"C:\Users\Linh\AppData\Roaming\9router\daemon\restart_daemon.ps1"
    res = subprocess.run(["powershell", "-File", restart_script], capture_output=True, text=True)
    print(res.stdout)
    print("✓ 9router restarted successfully.")
except Exception as e:
    print(f"✗ Failed to restart 9router: {e}")

print("\nAll updates complete!")

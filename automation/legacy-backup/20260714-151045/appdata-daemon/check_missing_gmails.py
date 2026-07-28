# check_missing_gmails.py
import os
import json
import sqlite3
import glob
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

db_path = r"C:\Users\Linh\AppData\Roaming\9router\db\data.sqlite"

# 1. Read active and disabled gmail accounts from 9router database
active_db_gmails = set()
disabled_db_gmails = set()

if os.path.exists(db_path):
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Query active connections ending with @gmail.com
        cursor.execute("SELECT DISTINCT email FROM providerConnections WHERE email LIKE '%@gmail.com' AND isActive = 1;")
        for row in cursor.fetchall():
            if row[0]:
                active_db_gmails.add(row[0].strip().lower())
                
        # Query disabled connections ending with @gmail.com
        cursor.execute("SELECT DISTINCT email FROM providerConnections WHERE email LIKE '%@gmail.com' AND isActive = 0;")
        for row in cursor.fetchall():
            if row[0]:
                disabled_db_gmails.add(row[0].strip().lower())
                
        conn.close()
    except Exception as e:
        print("Error reading 9router database:", e)
else:
    print("9router database not found at:", db_path)

print(f"Total active Gmails in 9router: {len(active_db_gmails)}")
print(f"Total disabled Gmails in 9router: {len(disabled_db_gmails)}")

# 2. Scan Chrome profiles for Gmails
chrome_user_data = r"C:\Users\Linh\AppData\Local\Google\Chrome\User Data"
chrome_gmails = {}

pref_files = glob.glob(os.path.join(chrome_user_data, "Default", "Preferences")) + \
             glob.glob(os.path.join(chrome_user_data, "Profile *", "Preferences"))

for pref_path in pref_files:
    profile_name = os.path.basename(os.path.dirname(pref_path))
    try:
        with open(pref_path, 'r', encoding='utf-8', errors='ignore') as f:
            pref_data = json.load(f)
            
        email = None
        services = pref_data.get("google", {}).get("services", {})
        if isinstance(services, dict):
            email = services.get("username")
            
        if not email:
            account_info = pref_data.get("account_info", [])
            if isinstance(account_info, list) and len(account_info) > 0:
                email = account_info[0].get("email")
                
        if not email:
            email = pref_data.get("signin", {}).get("username")
            
        if email:
            email_clean = email.strip().lower()
            if email_clean.endswith("@gmail.com"):
                chrome_gmails[email_clean] = profile_name
            
    except Exception as e:
        pass

print(f"Total Gmails found in Chrome profiles: {len(chrome_gmails)}")

# 3. Analyze differences
missing_entirely = []
exists_but_disabled = []

for email, profile in chrome_gmails.items():
    if email in active_db_gmails:
        # It is active, skip
        continue
    elif email in disabled_db_gmails:
        # It exists in DB but is disabled
        exists_but_disabled.append((email, profile))
    else:
        # It does not exist in DB at all
        missing_entirely.append((email, profile))

print(f"\n--- [1] Gmails in Chrome NOT in 9router at all ({len(missing_entirely)}) ---")
for idx, (email, profile) in enumerate(missing_entirely, 1):
    print(f"  {idx}. {email} (Chrome: {profile})")

print(f"\n--- [2] Gmails in Chrome but currently DISABLED in 9router ({len(exists_but_disabled)}) ---")
for idx, (email, profile) in enumerate(exists_but_disabled, 1):
    print(f"  {idx}. {email} (Chrome: {profile})")

# Save results
out_path = r"C:\Users\Linh\.gemini\antigravity\brain\ccbc54e6-6e4c-4398-bc19-6ba16b63fe56\missing_gmails_report.json"
try:
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump({
            "active_db_gmails_count": len(active_db_gmails),
            "disabled_db_gmails_count": len(disabled_db_gmails),
            "chrome_gmails_count": len(chrome_gmails),
            "missing_entirely_count": len(missing_entirely),
            "exists_but_disabled_count": len(exists_but_disabled),
            "missing_entirely": [{"email": e, "profile": p} for e, p in missing_entirely],
            "exists_but_disabled": [{"email": e, "profile": p} for e, p in exists_but_disabled]
        }, f, indent=2)
except Exception as e:
    print("Error saving report:", e)

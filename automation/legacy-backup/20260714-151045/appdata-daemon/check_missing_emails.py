# check_missing_emails.py
import os
import json
import sqlite3
import glob
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# 1. Read all emails from 9router database
db_path = r"C:\Users\Linh\AppData\Roaming\9router\db\data.sqlite"
db_emails = set()

if os.path.exists(db_path):
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT email FROM providerConnections;")
        for row in cursor.fetchall():
            if row[0]:
                db_emails.add(row[0].strip().lower())
        conn.close()
    except Exception as e:
        print("Error reading 9router database:", e)
else:
    print("9router database not found at:", db_path)

print(f"Total unique emails in 9router: {len(db_emails)}")

# 2. Scan Chrome profiles for emails
chrome_user_data = r"C:\Users\Linh\AppData\Local\Google\Chrome\User Data"
chrome_emails = {}

# Search for Preferences files in Profile directories
pref_files = glob.glob(os.path.join(chrome_user_data, "Default", "Preferences")) + \
             glob.glob(os.path.join(chrome_user_data, "Profile *", "Preferences"))

print(f"Found {len(pref_files)} Chrome profiles with Preferences.")

for pref_path in pref_files:
    profile_name = os.path.basename(os.path.dirname(pref_path))
    try:
        with open(pref_path, 'r', encoding='utf-8', errors='ignore') as f:
            pref_data = json.load(f)
            
        # Try to find logged in Google account username
        email = None
        
        # Method A: check google.services.username
        services = pref_data.get("google", {}).get("services", {})
        if isinstance(services, dict):
            email = services.get("username")
            
        # Method B: check account info
        if not email:
            account_info = pref_data.get("account_info", [])
            if isinstance(account_info, list) and len(account_info) > 0:
                email = account_info[0].get("email")
                
        # Method C: check signin.info
        if not email:
            email = pref_data.get("signin", {}).get("username")
            
        if email:
            email_clean = email.strip().lower()
            chrome_emails[email_clean] = profile_name
            
    except Exception as e:
        print(f"Error reading profile {profile_name}: {e}")

print(f"Total unique emails found in Chrome profiles: {len(chrome_emails)}")

# 3. Find missing emails (in Chrome but not in 9router)
missing_emails = []
for email, profile in chrome_emails.items():
    if email not in db_emails:
        missing_emails.append((email, profile))

print(f"\nFound {len(missing_emails)} missing emails:")
for idx, (email, profile) in enumerate(missing_emails, 1):
    print(f"  {idx}. {email} (Chrome: {profile})")

# Let's save the results to a file for reference
out_path = r"C:\Users\Linh\.gemini\antigravity\brain\ccbc54e6-6e4c-4398-bc19-6ba16b63fe56\missing_emails_report.json"
try:
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump({
            "db_emails_count": len(db_emails),
            "chrome_emails_count": len(chrome_emails),
            "missing_emails_count": len(missing_emails),
            "missing_emails": [{"email": e, "profile": p} for e, p in missing_emails]
        }, f, indent=2)
    print(f"\nSaved detailed report to: {out_path}")
except Exception as e:
    print("Error saving report:", e)

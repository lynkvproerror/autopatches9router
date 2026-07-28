import os
import json
import sqlite3
import shutil
import re
import sys

# Ensure UTF-8 output to display Vietnamese text correctly in Windows Terminal
sys.stdout.reconfigure(encoding='utf-8')

# Regex to validate email formats
EMAIL_REGEX = re.compile(r'\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b')

def get_9router_emails():
    db_path = r"C:\Users\Linh\AppData\Roaming\9router\db\data.sqlite"
    temp_db_path = r"C:\Users\Linh\.gemini\antigravity\scratch\data_temp.sqlite"
    
    if not os.path.exists(db_path):
        print("9router database not found at:", db_path)
        return set(), {}
        
    shutil.copyfile(db_path, temp_db_path)
    
    emails = set()
    connection_details = {}
    
    conn = None
    try:
        conn = sqlite3.connect(temp_db_path)
        cursor = conn.cursor()
        
        # Check if providerConnections table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='providerConnections';")
        if not cursor.fetchone():
            print("Table 'providerConnections' not found in 9router database.")
            return set(), {}
            
        cursor.execute("SELECT email, isActive, name, provider FROM providerConnections;")
        rows = cursor.fetchall()
        for email, is_active, name, provider in rows:
            if email:
                email_lower = email.strip().lower()
                emails.add(email_lower)
                connection_details[email_lower] = {
                    "email": email,
                    "isActive": bool(is_active),
                    "name": name,
                    "provider": provider
                }
    except Exception as e:
        print(f"Error querying 9router DB: {e}")
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass
        if os.path.exists(temp_db_path):
            try:
                os.remove(temp_db_path)
            except Exception as e:
                print(f"Failed to remove temp DB file: {e}")
            
    return emails, connection_details

def find_local_state_files():
    appdata_local = r"C:\Users\Linh\AppData\Local"
    candidates = [
        os.path.join(appdata_local, "Google", "Chrome", "User Data", "Local State"),
        os.path.join(appdata_local, "Microsoft", "Edge", "User Data", "Local State"),
        os.path.join(appdata_local, "CocCoc", "Browser", "User Data", "Local State"),
        os.path.join(appdata_local, "K12Tools_CDP_Link", "Local State"),
        os.path.join(appdata_local, "K12Tools_CDP_Profile", "Local State"),
        os.path.join(appdata_local, "K12Tools_CDP_Profile2", "Local State"),
        os.path.join(appdata_local, "SunoSmartChrome_9222", "Local State"),
    ]
    local_states = [path for path in candidates if os.path.exists(path)]
    return local_states

def extract_emails_from_local_state(path):
    browser_profiles = []
    
    # Try to identify browser name from path
    browser_name = "Unknown Browser"
    rel_path = os.path.relpath(path, r"C:\Users\Linh\AppData\Local")
    parts = rel_path.split(os.sep)
    if len(parts) >= 2:
        browser_name = f"{parts[0]} ({parts[1]})"
    else:
        browser_name = parts[0]
        
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        profile_info = data.get("profile", {}).get("info_cache", {})
        for p_dir, p_data in profile_info.items():
            user_name = p_data.get("user_name", "")
            profile_name = p_data.get("name", "")
            
            detected_emails = []
            
            # Check user_name field
            if user_name and EMAIL_REGEX.match(user_name):
                detected_emails.append(user_name.strip().lower())
                
            # Check if the profile name itself is an email
            if profile_name and EMAIL_REGEX.match(profile_name):
                detected_emails.append(profile_name.strip().lower())
                
            # Deduplicate
            detected_emails = list(set(detected_emails))
            
            for email in detected_emails:
                browser_profiles.append({
                    "email": email,
                    "profile_dir": p_dir,
                    "profile_name": profile_name,
                    "browser": browser_name,
                    "path": path
                })
    except Exception as e:
        print(f"Error reading Local State at {path}: {e}")
        
    return browser_profiles

def main():
    print("--- 1. LOADING 9ROUTER EMAILS ---")
    router_emails, router_details = get_9router_emails()
    print(f"Loaded {len(router_emails)} unique email accounts from 9router.")
    
    print("\n--- 2. SCANNING BROWSERS FOR SIGNED-IN EMAILS ---")
    local_state_paths = find_local_state_files()
    print(f"Found {len(local_state_paths)} 'Local State' files:")
    for p in local_state_paths:
        print(f" - {p}")
        
    all_browser_profiles = []
    for path in local_state_paths:
        profiles = extract_emails_from_local_state(path)
        all_browser_profiles.extend(profiles)
        
    print(f"\nExtracted {len(all_browser_profiles)} browser profiles with signed-in emails.")
    
    # Group browser profiles by email
    browser_by_email = {}
    for bp in all_browser_profiles:
        email = bp["email"]
        if email not in browser_by_email:
            browser_by_email[email] = []
        browser_by_email[email].append(bp)
        
    print("\n--- 3. COMPARISON RESULTS ---")
    not_added = []
    added = []
    
    for email, profiles in browser_by_email.items():
        if email in router_emails:
            added.append((email, profiles))
        else:
            not_added.append((email, profiles))
            
    print(f"Emails already in 9router: {len(added)}")
    print(f"Emails NOT in 9router yet: {len(not_added)}")
    
    if not_added:
        print("\n=============================================================")
        print("LIST OF EMAILS FOUND IN BROWSERS BUT NOT IN 9ROUTER:")
        print("=============================================================")
        
        # Sort by browser name and then email
        not_added.sort(key=lambda x: (x[1][0]["browser"], x[0]))
        
        current_browser = None
        for email, profiles in not_added:
            prof = profiles[0] # primary profile info
            if prof["browser"] != current_browser:
                current_browser = prof["browser"]
                print(f"\n📁 Browser: {current_browser}")
                print("-" * 50)
            
            # Format output
            prof_details = []
            for p in profiles:
                name_str = f"'{p['profile_name']}'" if p['profile_name'] != p['email'] else "Same as Email"
                prof_details.append(f"{p['profile_dir']} ({name_str})")
            
            print(f" 📧 {email:<40} | Profiles: {', '.join(prof_details)}")
    else:
        print("\n🎉 Success! All emails found in browsers have already been added to 9router.")
        
    # Also print any emails in 9router that are not in the scanned browser profiles
    scanned_emails = set(browser_by_email.keys())
    only_in_router = router_emails - scanned_emails
    if only_in_router:
        print("\n=============================================================")
        print("LIST OF EMAILS IN 9ROUTER BUT NOT DETECTED IN LOCAL BROWSERS:")
        print("=============================================================")
        for email in sorted(only_in_router):
            det = router_details[email]
            status_str = "Active" if det["isActive"] else "Inactive"
            print(f" 📧 {email:<40} | Provider: {det['provider']:<10} | Status: {status_str}")

if __name__ == "__main__":
    main()

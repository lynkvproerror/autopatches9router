import os
import json
import sqlite3
import shutil
import re
import sys

# Ensure UTF-8 output
sys.stdout.reconfigure(encoding='utf-8')

EMAIL_REGEX = re.compile(r'\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b')
ARTIFACT_DIR = r"C:\Users\Linh\.gemini\antigravity\brain\2ba8f3f1-e1df-4f53-be6c-d63f253cb069"
OUTPUT_FILE = os.path.join(ARTIFACT_DIR, "analysis_results.md")

def get_9router_emails():
    db_path = r"C:\Users\Linh\AppData\Roaming\9router\db\data.sqlite"
    temp_db_path = r"C:\Users\Linh\.gemini\antigravity\scratch\data_temp.sqlite"
    
    if not os.path.exists(db_path):
        return set(), {}
        
    shutil.copyfile(db_path, temp_db_path)
    
    emails = set()
    connection_details = {}
    conn = None
    try:
        conn = sqlite3.connect(temp_db_path)
        cursor = conn.cursor()
        
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='providerConnections';")
        if not cursor.fetchone():
            return set(), {}
            
        cursor.execute("SELECT email, isActive, name, provider FROM providerConnections;")
        rows = cursor.fetchall()
        for email, is_active, name, provider in rows:
            if email:
                email_clean = email.strip()
                email_lower = email_clean.lower()
                emails.add(email_lower)
                connection_details[email_lower] = {
                    "email": email_clean,
                    "isActive": bool(is_active),
                    "name": name,
                    "provider": provider
                }
    except Exception as e:
        print(f"Error reading 9router DB: {e}")
    finally:
        if conn:
            try: conn.close()
            except Exception: pass
        if os.path.exists(temp_db_path):
            try: os.remove(temp_db_path)
            except Exception: pass
            
    return emails, connection_details

def find_local_state_files():
    appdata_local = r"C:\Users\Linh\AppData\Local"
    candidates = [
        ("Google Chrome", os.path.join(appdata_local, "Google", "Chrome", "User Data", "Local State")),
        ("Microsoft Edge", os.path.join(appdata_local, "Microsoft", "Edge", "User Data", "Local State")),
        ("CocCoc Browser", os.path.join(appdata_local, "CocCoc", "Browser", "User Data", "Local State")),
        ("K12Tools CDP Link", os.path.join(appdata_local, "K12Tools_CDP_Link", "Local State")),
        ("K12Tools CDP Profile", os.path.join(appdata_local, "K12Tools_CDP_Profile", "Local State")),
        ("K12Tools CDP Profile2", os.path.join(appdata_local, "K12Tools_CDP_Profile2", "Local State")),
        ("SunoSmartChrome", os.path.join(appdata_local, "SunoSmartChrome_9222", "Local State")),
    ]
    return [(name, path) for name, path in candidates if os.path.exists(path)]

def extract_emails_from_local_state(browser_name, path):
    browser_profiles = []
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        profile_info = data.get("profile", {}).get("info_cache", {})
        for p_dir, p_data in profile_info.items():
            user_name = p_data.get("user_name", "")
            profile_name = p_data.get("name", "")
            
            detected_emails = []
            if user_name and EMAIL_REGEX.match(user_name):
                detected_emails.append(user_name.strip().lower())
            if profile_name and EMAIL_REGEX.match(profile_name):
                detected_emails.append(profile_name.strip().lower())
                
            detected_emails = list(set(detected_emails))
            for email in detected_emails:
                browser_profiles.append({
                    "email": email,
                    "profile_dir": p_dir,
                    "profile_name": profile_name,
                    "browser": browser_name
                })
    except Exception as e:
        print(f"Error reading {browser_name} Local State: {e}")
    return browser_profiles

def main():
    router_emails, router_details = get_9router_emails()
    local_states = find_local_state_files()
    
    all_browser_profiles = []
    for browser_name, path in local_states:
        all_browser_profiles.extend(extract_emails_from_local_state(browser_name, path))
        
    # Group profiles by email
    browser_by_email = {}
    for bp in all_browser_profiles:
        email = bp["email"]
        if email not in browser_by_email:
            browser_by_email[email] = []
        browser_by_email[email].append(bp)
        
    # Unique emails found in browser
    unique_browser_emails = set(browser_by_email.keys())
    
    # Categorize
    not_added_emails = sorted(list(unique_browser_emails - router_emails))
    added_emails = sorted(list(unique_browser_emails & router_emails))
    router_only_emails = sorted(list(router_emails - unique_browser_emails))
    
    # Generate Markdown Report
    os.makedirs(ARTIFACT_DIR, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write("# Báo cáo so sánh tài khoản Trình duyệt & 9router\n\n")
        f.write("Báo cáo này liệt kê các tài khoản email được tìm thấy trên các trình duyệt cục bộ và đối chiếu với các tài khoản đã được cấu hình trong 9router để xác định các email chưa được add.\n\n")
        
        # Summary Section
        f.write("## 📊 Tóm tắt thống kê\n\n")
        f.write(f"- **Tổng số email đăng nhập trên Trình duyệt (không trùng):** `{len(unique_browser_emails)}`\n")
        f.write(f"- **Tổng số tài khoản đã được cấu hình trên 9router:** `{len(router_emails)}`\n")
        f.write(f"- **⚠️ Số tài khoản email trên Trình duyệt CHƯA add vào 9router:** `{len(not_added_emails)}`\n")
        f.write(f"- **✅ Số tài khoản email trên Trình duyệt ĐÃ add vào 9router:** `{len(added_emails)}`\n\n")
        
        # Alerts
        if not_added_emails:
            f.write("> [!IMPORTANT]\n")
            f.write(f"> Phát hiện **{len(not_added_emails)} email** đang hoạt động trên trình duyệt nhưng chưa được cấu hình vào 9router. Xem danh sách chi tiết bên dưới.\n\n")
        else:
            f.write("> [!NOTE]\n")
            f.write("> Tất cả các tài khoản đăng nhập trên các trình duyệt được quét đã được add đầy đủ vào 9router.\n\n")
            
        # Section 1: Not added
        f.write("## ❌ Danh sách Email trên Trình duyệt CHƯA add vào 9router\n\n")
        if not_added_emails:
            f.write("| STT | Địa chỉ Email | Trình duyệt & Profile (Thư mục) | Tên hiển thị Profile |\n")
            f.write("|---|---|---|---|\n")
            for idx, email in enumerate(not_added_emails, 1):
                profiles = browser_by_email[email]
                # Deduplicate browser and profile info for clean display
                locations = []
                names = []
                for p in profiles:
                    loc = f"{p['browser']} - `{p['profile_dir']}`"
                    if loc not in locations:
                        locations.append(loc)
                    if p['profile_name'] and p['profile_name'] not in names:
                        names.append(p['profile_name'])
                        
                locations_str = "<br>".join(locations)
                names_str = ", ".join(f"'{n}'" for n in names) if names else "N/A"
                f.write(f"| {idx} | **{email}** | {locations_str} | {names_str} |\n")
        else:
            f.write("*Không có tài khoản nào.*\n")
        f.write("\n")
        
        # Section 2: Router only (not found in local browsers)
        f.write("## 🔍 Danh sách Email trong 9router nhưng không thấy trên Trình duyệt cục bộ\n\n")
        f.write("> [!NOTE]\n")
        f.write("> Các tài khoản này đã được add vào 9router nhưng không tìm thấy cấu hình đăng nhập tương ứng trong các tệp `Local State` được quét (có thể do dùng profile ẩn danh, trình duyệt khác, đã đăng xuất hoặc ở thiết bị khác).\n\n")
        if router_only_emails:
            f.write("| STT | Địa chỉ Email | Provider | Trạng thái hoạt động | Tên trên 9router |\n")
            f.write("|---|---|---|---|---|\n")
            for idx, email in enumerate(router_only_emails, 1):
                det = router_details[email]
                status = "🟢 Hoạt động" if det["isActive"] else "🔴 Tạm dừng"
                f.write(f"| {idx} | `{email}` | {det['provider']} | {status} | {det['name'] or 'N/A'} |\n")
        else:
            f.write("*Không có tài khoản nào.*\n")
        f.write("\n")
        
        # Section 3: Added
        f.write("## ✅ Danh sách Email đã được add vào 9router thành công\n\n")
        if added_emails:
            f.write("| STT | Địa chỉ Email | Trình duyệt gốc | Trạng thái trên 9router | Provider |\n")
            f.write("|---|---|---|---|---|\n")
            for idx, email in enumerate(added_emails, 1):
                profiles = browser_by_email[email]
                det = router_details[email]
                browsers = list(set(p['browser'] for p in profiles))
                status = "🟢 Hoạt động" if det["isActive"] else "🔴 Tạm dừng"
                f.write(f"| {idx} | {email} | {', '.join(browsers)} | {status} | {det['provider']} |\n")
        else:
            f.write("*Không có tài khoản nào.*\n")
        f.write("\n")

    print(f"Comparison complete! Output saved to: {OUTPUT_FILE}")

if __name__ == "__main__":
    main()

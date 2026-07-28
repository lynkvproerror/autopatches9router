# inspect_disabled.py
import sqlite3
import json

db_path = r"C:\Users\Linh\AppData\Roaming\9router\db\data.sqlite"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

emails_to_check = [
    'ulsavan95@gmail.com',
    'melosy.chill@gmail.com',
    'melosy.deephouse@gmail.com',
    'melosy.edmkhmer@gmail.com',
    'hphanbiz25@gmail.com',
    'melosy.pop@gmail.com'
]

for email in emails_to_check:
    cursor.execute("SELECT id, name, email, isActive, data FROM providerConnections WHERE email = ?;", (email,))
    row = cursor.fetchone()
    if row:
        c_id, name, mail, is_active, data_str = row
        data_json = {}
        try:
            data_json = json.loads(data_str) if data_str else {}
        except Exception:
            pass
        test_status = data_json.get("testStatus")
        error_code = data_json.get("errorCode")
        print(f"Email: {mail} | isActive: {is_active} | testStatus: {test_status} | errorCode: {error_code}")
    else:
        print(f"Email: {email} not found in DB")

conn.close()

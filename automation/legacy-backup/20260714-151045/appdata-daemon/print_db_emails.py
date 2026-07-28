# print_db_emails.py
import sqlite3

db_path = r"C:\Users\Linh\AppData\Roaming\9router\db\data.sqlite"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute("SELECT DISTINCT email FROM providerConnections;")
rows = cursor.fetchall()
conn.close()

print("All emails in DB:")
for r in rows:
    print(f"- '{r[0]}'")

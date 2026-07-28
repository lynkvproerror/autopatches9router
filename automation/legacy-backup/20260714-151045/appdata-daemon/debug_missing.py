# debug_missing.py
import sqlite3
import os

db_path = r"C:\Users\Linh\AppData\Roaming\9router\db\data.sqlite"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute("SELECT email, name FROM providerConnections;")
rows = cursor.fetchall()
conn.close()

for email, name in rows:
    if email and "levanlinh" in email.lower():
        print(f"Email in DB: '{email}' | Name: '{name}'")

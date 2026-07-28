# query_db_levanlinh.py
import sqlite3

db_path = r"C:\Users\Linh\AppData\Roaming\9router\db\data.sqlite"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute("SELECT id, name, email FROM providerConnections WHERE email LIKE '%levanlinh%' OR name LIKE '%Linh%';")
rows = cursor.fetchall()
conn.close()

print(f"Found {len(rows)} matches:")
for r in rows:
    print(r)

# print_db_columns.py
import sqlite3

db_path = r"C:\Users\Linh\AppData\Roaming\9router\db\data.sqlite"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute("PRAGMA table_info(providerConnections);")
print("Columns:", cursor.fetchall())
cursor.execute("SELECT * FROM providerConnections LIMIT 1;")
print("Row 1:", cursor.fetchone())
conn.close()

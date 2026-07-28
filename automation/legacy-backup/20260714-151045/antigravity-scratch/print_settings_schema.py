import sqlite3
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

db_path = r"C:\Users\Linh\AppData\Roaming\9router\db\data.sqlite"

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(settings);")
    cols = cursor.fetchall()
    print("Columns of 'settings' table:")
    for c in cols:
        print(f"  {c[1]} ({c[2]})")
    conn.close()
except Exception as e:
    print(f"Error: {e}")

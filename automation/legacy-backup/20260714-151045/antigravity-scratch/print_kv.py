import sqlite3
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

db_path = r"C:\Users\Linh\AppData\Roaming\9router\db\data.sqlite"

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cursor.execute("SELECT scope, key, value FROM kv")
    rows = cursor.fetchall()
    print("All rows in kv table:")
    for r in rows:
        print(f"Scope: {r[0]} | Key: {r[1]} | Value: {r[2][:100]}")
        
    conn.close()
except Exception as e:
    print(f"Error: {e}")

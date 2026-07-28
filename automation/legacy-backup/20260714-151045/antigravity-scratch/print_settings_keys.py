import sqlite3
import os
import sys
import json

sys.stdout.reconfigure(encoding='utf-8')

db_path = r"C:\Users\Linh\AppData\Roaming\9router\db\data.sqlite"

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cursor.execute("SELECT data FROM settings LIMIT 1")
    row = cursor.fetchone()
    if row:
        data = json.loads(row[0])
        print("Root keys of settings JSON:")
        for k in data.keys():
            v = data[k]
            if isinstance(v, dict):
                print(f"  {k}: dict with keys {list(v.keys())[:10]}")
            else:
                print(f"  {k}: {type(v).__name__} = {str(v)[:100]}")
    conn.close()
except Exception as e:
    print(f"Error: {e}")

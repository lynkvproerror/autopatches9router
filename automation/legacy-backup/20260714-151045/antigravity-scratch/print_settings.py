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
        val = row[0]
        try:
            val_obj = json.loads(val)
            print("Settings JSON:")
            print(json.dumps(val_obj, indent=2))
        except Exception as e:
            print(f"Error parsing JSON: {e}")
            print(f"Value: {val[:500]}")
    else:
        print("Settings table is empty")
            
    conn.close()
except Exception as e:
    print(f"Error: {e}")

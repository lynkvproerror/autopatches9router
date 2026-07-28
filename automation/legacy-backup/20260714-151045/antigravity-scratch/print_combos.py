import sqlite3
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

db_path = r"C:\Users\Linh\AppData\Roaming\9router\db\data.sqlite"

if not os.path.exists(db_path):
    print("9router database not found")
    sys.exit(1)

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, name, kind, models FROM combos")
    rows = cursor.fetchall()
    print("All combos in 9router database:")
    for r in rows:
        print(f"ID: {r[0]} | Name: {r[1]} | Kind: {r[2]} | Target Models: {r[3]}")
        
    conn.close()
except Exception as e:
    print(f"Error: {e}")

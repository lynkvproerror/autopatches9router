import sqlite3
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

db_path = r"C:\Users\Linh\AppData\Roaming\9router\db\data.sqlite"

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()
    print("Tables in 9router database:")
    for t in tables:
        print(f"  {t[0]}")
        
    conn.close()
except Exception as e:
    print(f"Error: {e}")

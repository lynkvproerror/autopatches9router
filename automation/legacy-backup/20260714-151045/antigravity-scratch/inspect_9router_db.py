import sqlite3
import shutil
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

db_path = r"C:\Users\Linh\AppData\Roaming\9router\db\data.sqlite"
temp_db_path = r"C:\Users\Linh\.gemini\antigravity\scratch\data_temp.sqlite"

shutil.copyfile(db_path, temp_db_path)

try:
    conn = sqlite3.connect(temp_db_path)
    cursor = conn.cursor()
    
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()
    
    for t in tables:
        table_name = t[0]
        if table_name == 'sqlite_sequence':
            continue
        cursor.execute(f"PRAGMA table_info({table_name});")
        columns = cursor.fetchall()
        col_names = [col[1] for col in columns]
        
        cursor.execute(f"SELECT COUNT(*) FROM {table_name};")
        count = cursor.fetchone()[0]
        
        print(f"Table: {table_name} (rows: {count})")
        print(f"Columns: {col_names}")
        
        cursor.execute(f"SELECT * FROM {table_name} LIMIT 3;")
        rows = cursor.fetchall()
        for r in rows:
            print(f"  {r}")
        print("="*50)
            
    conn.close()
finally:
    if os.path.exists(temp_db_path):
        os.remove(temp_db_path)

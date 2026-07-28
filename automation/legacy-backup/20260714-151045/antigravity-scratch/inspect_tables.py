import sqlite3
import shutil
import os
import sys

db_path = r"C:\Users\Linh\AppData\Roaming\9router\db\data.sqlite"
temp_db_path = r"C:\Users\Linh\.gemini\antigravity\scratch\data_temp.sqlite"
output_path = r"C:\Users\Linh\.gemini\antigravity\scratch\inspect_tables.txt"

shutil.copyfile(db_path, temp_db_path)

try:
    conn = sqlite3.connect(temp_db_path)
    cursor = conn.cursor()
    
    interesting_tables = ['providerConnections', 'providerNodes', 'proxyPools', 'combos', 'settings', 'apiKeys', 'kv']
    
    with open(output_path, 'w', encoding='utf-8') as out:
        for table_name in interesting_tables:
            cursor.execute(f"SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='{table_name}';")
            exists = cursor.fetchone()[0]
            if not exists:
                out.write(f"Table {table_name} does not exist.\n")
                continue
                
            cursor.execute(f"PRAGMA table_info({table_name});")
            columns = cursor.fetchall()
            col_names = [col[1] for col in columns]
            
            cursor.execute(f"SELECT COUNT(*) FROM {table_name};")
            count = cursor.fetchone()[0]
            
            out.write(f"Table: {table_name} (rows: {count})\n")
            out.write(f"Columns: {col_names}\n")
            
            cursor.execute(f"SELECT * FROM {table_name};")
            rows = cursor.fetchall()
            for r in rows:
                out.write(f"  {r}\n")
            out.write("="*60 + "\n")
            
    conn.close()
    print("Done writing to inspect_tables.txt")
finally:
    if os.path.exists(temp_db_path):
        os.remove(temp_db_path)

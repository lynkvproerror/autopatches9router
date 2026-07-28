import sqlite3
import os
import sys
import uuid
import datetime

sys.stdout.reconfigure(encoding='utf-8')

db_path = r"C:\Users\Linh\AppData\Roaming\9router\db\data.sqlite"

if not os.path.exists(db_path):
    print("9router database not found")
    sys.exit(1)

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    new_combos = [
        ("gpt-5.6-terra", '["cx/gpt-5.6-terra"]'),
        ("gpt-5.6-luna", '["cx/gpt-5.6-luna"]'),
        ("gpt-5.6-sol", '["cx/gpt-5.6-sol"]'),
    ]
    
    now_str = datetime.datetime.utcnow().isoformat() + "Z"
    inserted = 0
    
    for name, target_models in new_combos:
        cursor.execute("SELECT id FROM combos WHERE name = ?", (name,))
        row = cursor.fetchone()
        if not row:
            combo_id = str(uuid.uuid4())
            cursor.execute(
                "INSERT INTO combos (id, name, kind, models, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
                (combo_id, name, "llm", target_models, now_str, now_str)
            )
            print(f"✓ Created combo: {name} -> {target_models}")
            inserted += 1
        else:
            print(f"! Combo already exists: {name}")
            
    conn.commit()
    conn.close()
    print(f"Database commit completed. Total inserted: {inserted}")
except Exception as e:
    print(f"Error: {e}")

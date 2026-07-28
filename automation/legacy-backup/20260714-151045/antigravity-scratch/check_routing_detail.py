import sqlite3, sys, json
sys.stdout.reconfigure(encoding='utf-8')

db_path = r"C:\Users\Linh\AppData\Roaming\9router\db\data.sqlite"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Get column names for requestDetails
cursor.execute("PRAGMA table_info(requestDetails)")
cols_info = cursor.fetchall()
col_names = [c[1] for c in cols_info]
print(f"requestDetails columns: {col_names}")

# Get recent requests
cursor.execute(f"SELECT * FROM requestDetails ORDER BY rowid DESC LIMIT 5")
rows = cursor.fetchall()
print(f"\n=== Recent {len(rows)} Requests ===")
for row in rows:
    d = dict(zip(col_names, row))
    # Print relevant fields
    for k in col_names:
        v = d.get(k)
        if v is not None and str(v).strip():
            v_str = str(v)[:200]
            print(f"  {k}: {v_str}")
    print("  ---")

conn.close()

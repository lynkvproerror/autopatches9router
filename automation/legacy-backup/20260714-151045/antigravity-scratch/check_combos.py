import sqlite3, sys, json
sys.stdout.reconfigure(encoding='utf-8')

db_path = r"C:\Users\Linh\AppData\Roaming\9router\db\data.sqlite"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# List all tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [t[0] for t in cursor.fetchall()]
print("Tables:", tables)

# Find combos table or similar
for t in tables:
    if 'combo' in t.lower() or 'model' in t.lower() or 'route' in t.lower():
        cursor.execute(f"PRAGMA table_info([{t}])")
        cols = [c[1] for c in cursor.fetchall()]
        print(f"\nTable [{t}] columns: {cols}")
        cursor.execute(f"SELECT * FROM [{t}] WHERE CAST(name AS TEXT) LIKE '%5.6%' OR CAST(name AS TEXT) LIKE '%5.5%' LIMIT 10")
        for row in cursor.fetchall():
            print(f"  {row}")

# Check kv table
if 'kv' in tables:
    cursor.execute("SELECT key FROM kv WHERE key LIKE '%combo%' OR key LIKE '%5.6%' OR key LIKE '%custom%' LIMIT 20")
    rows = cursor.fetchall()
    print(f"\nKV keys matching combo/5.6/custom: {len(rows)}")
    for r in rows:
        cursor.execute("SELECT value FROM kv WHERE key = ?", (r[0],))
        val = cursor.fetchone()[0]
        val_str = val[:500] if isinstance(val, str) and len(val) > 500 else val
        print(f"  {r[0]}: {val_str}")

conn.close()

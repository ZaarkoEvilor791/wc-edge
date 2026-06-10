"""Fix suggested_squad.id — create sequence and set as default."""
from engine.db import connect

conn = connect()
with conn.cursor() as cur:
    # Create the sequence if it doesn't exist
    cur.execute("CREATE SEQUENCE IF NOT EXISTS wc.suggested_squad_id_seq")
    # Set it as the default for the id column
    cur.execute("""
        ALTER TABLE wc.suggested_squad
          ALTER COLUMN id SET DEFAULT nextval('wc.suggested_squad_id_seq'::regclass)
    """)
    # Sync sequence to max existing id
    cur.execute("SELECT COALESCE(MAX(id), 0) FROM wc.suggested_squad")
    max_id = cur.fetchone()[0]
    cur.execute(f"SELECT setval('wc.suggested_squad_id_seq', {max(max_id, 1)})")
conn.commit()
print(f"Fixed: sequence created, max existing id = {max_id}")
conn.close()

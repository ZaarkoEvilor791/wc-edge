"""Migration: create player_stats (missing from Neon migration), add bonus columns, add is_penalty_taker."""
from engine.db import connect

conn = connect()
with conn.cursor() as cur:
    # Create player_stats if missing (was not included in Neon migration)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS wc.player_stats (
            element          INTEGER PRIMARY KEY,
            api_football_id  INTEGER,
            club_goals90     REAL,
            club_assists90   REAL,
            club_minutes     INTEGER,
            club_start_rate  REAL,
            club_saves90     REAL,
            tourn_source     TEXT,
            tourn_xg90       REAL,
            tourn_xa90       REAL,
            tourn_minutes    INTEGER,
            tourn_age_years  REAL,
            tourn_saves90    REAL,
            tourn_chances90  REAL,
            tourn_tackles90  REAL,
            tourn_sot90      REAL,
            scraped_at       TIMESTAMP DEFAULT NOW()
        )
    """)
    # Add new columns if table already existed without them
    cur.execute("ALTER TABLE wc.player_stats ADD COLUMN IF NOT EXISTS tourn_chances90 REAL")
    cur.execute("ALTER TABLE wc.player_stats ADD COLUMN IF NOT EXISTS tourn_tackles90 REAL")
    cur.execute("ALTER TABLE wc.player_stats ADD COLUMN IF NOT EXISTS tourn_sot90     REAL")
    # is_active already exists on teams per CLAUDE.md; add is_penalty_taker to players
    cur.execute("ALTER TABLE wc.players ADD COLUMN IF NOT EXISTS is_penalty_taker BOOLEAN DEFAULT FALSE")
conn.commit()
print("Migration complete")
conn.close()

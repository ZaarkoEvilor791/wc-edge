"""Seed is_penalty_taker for confirmed WC 2026 national team penalty takers.

Sources: FantasyFootballScout all-48-nations set-piece guide, RotoWire WC 2026 set-piece takers,
Squawka / AllAboutFPL pre-tournament penalty taker confirmations.
"""
from engine.db import connect

# Partial last-name fragments to fuzzy-match known_name / last_name
# Using ILIKE for safety since FIFA Fantasy abbreviates (e.g. "E. Haaland", "K. Mbappé")
PENALTY_TAKERS = [
    # Norway
    "Haaland",
    # France
    "Mbappé", "Mbappe",
    # England
    "Kane",
    # Argentina
    "Messi",
    # Egypt
    "Salah",
    # Portugal
    "Ronaldo",
    # Belgium
    "De Bruyne",
    # USA
    "Pulisic",
    # Spain
    "Oyarzabal",
    # Brazil
    "Vinicius", "Vinicius Jr",
    # Germany
    "Wirtz",
    # Netherlands
    "Depay",
    # Poland
    "Lewandowski",
    # South Korea
    "Son Heung",
    # Japan
    "Minamino",
    # Mexico
    "Lozano",
    # Colombia
    "Rodriguez", "J. Rodriguez",
    # Uruguay
    "Nunez", "Darwin",
    # Senegal
    "Mane",
    # Morocco
    "Ziyech",
    # Croatia
    "Modric",
    # Switzerland
    "Xhaka",
    # Denmark
    "Eriksen",
    # Australia
    "Leckie",
    # Ecuador
    "Enner Valencia", "Valencia",
    # Canada
    "Davies", "A. Davies",
]

conn = connect()
updated_total = 0
matched_names = []

with conn.cursor() as cur:
    for fragment in PENALTY_TAKERS:
        cur.execute(
            """
            UPDATE wc.players
            SET is_penalty_taker = TRUE
            WHERE (known_name ILIKE %s OR last_name ILIKE %s)
              AND is_penalty_taker = FALSE
            RETURNING element, known_name, last_name
            """,
            (f"%{fragment}%", f"%{fragment}%"),
        )
        rows = cur.fetchall()
        for r in rows:
            matched_names.append(f"  {r[1] or r[2]} (id={r[0]})")
            updated_total += 1

conn.commit()

print(f"Marked {updated_total} players as penalty takers:")
for name in matched_names:
    print(name)

# Verify: show all penalty takers with their squad
with conn.cursor() as cur:
    cur.execute("""
        SELECT p.known_name, p.last_name, p.position, p.price, t.name
        FROM wc.players p
        LEFT JOIN wc.teams t ON p.squad_id = t.squad_id
        WHERE p.is_penalty_taker = TRUE
        ORDER BY p.price DESC
    """)
    rows = cur.fetchall()

print(f"\nFinal list ({len(rows)} penalty takers):")
for r in rows:
    print(f"  {r[0] or r[1]} ({r[2]}, £{r[3]}m) — {r[4]}")

conn.close()

"""Verify that penalty takers and high-chance midfielders got boosted projections."""
from engine.db import connect

conn = connect()
with conn.cursor() as cur:
    # Top 15 players by xP in Round 1
    cur.execute("""
        SELECT COALESCE(p.known_name, p.first_name || ' ' || p.last_name) AS name,
               p.position, p.price, pr.xp,
               p.is_penalty_taker,
               ps.tourn_chances90, ps.tourn_tackles90, ps.tourn_sot90
        FROM wc.projections pr
        JOIN wc.players p ON pr.element = p.element
        LEFT JOIN wc.player_stats ps ON pr.element = ps.element
        WHERE pr.round = 1
        ORDER BY pr.xp DESC
        LIMIT 20
    """)
    rows = cur.fetchall()
    print("Top 20 players by xP (Round 1):")
    print(f"{'Name':<25} {'Pos':<5} {'£':<6} {'xP':<7} {'PK?':<5} {'Ch90':<7} {'Tk90':<7} {'SOT90'}")
    for r in rows:
        print(f"{r[0]:<25} {r[1]:<5} {r[2]:<6} {r[3]:<7.3f} {str(r[4]):<5} {str(r[5] or '-'):<7} {str(r[6] or '-'):<7} {r[7] or '-'}")

    # Compare a known playmaker vs generic MID
    print("\n--- Key player spot checks ---")
    for name_frag in ["De Bruyne", "Mbappé", "Haaland", "Salah", "Son Heung", "Oyarzabal"]:
        cur.execute("""
            SELECT COALESCE(p.known_name, p.first_name || ' ' || p.last_name),
                   p.position, p.price, pr.xp, p.is_penalty_taker,
                   ps.tourn_chances90, ps.tourn_sot90
            FROM wc.projections pr
            JOIN wc.players p ON pr.element = p.element
            LEFT JOIN wc.player_stats ps ON pr.element = ps.element
            WHERE pr.round = 1
              AND (p.known_name ILIKE %s OR p.last_name ILIKE %s)
            ORDER BY pr.xp DESC LIMIT 1
        """, (f"%{name_frag}%", f"%{name_frag}%"))
        r = cur.fetchone()
        if r:
            print(f"  {r[0]}: xP={r[3]:.3f}, PK={r[4]}, ch90={r[5]}, sot90={r[6]}")

conn.close()

"""Phase 3: MILP squad optimizer → writes wc.suggested_squad."""

import json
import math

import psycopg

from .db import connect

SQUAD_SIZE = 15
POS_COUNTS = {"GK": 2, "DEF": 5, "MID": 5, "FWD": 3}
BUDGET_GROUP = 100.0
MAX_PER_TEAM = 3  # default / group stage
VALUE_PRICE_PENALTY = 0.08  # differential: xp - penalty*price rewards value picks

_STAGE_COUNTRY_CAP: dict[str, int] = {
    "GROUP": 3, "R32": 3, "R16": 4, "QF": 5, "SF": 6, "FINAL": 8,
}


def _country_cap(stage: str) -> int:
    s = (stage or "GROUP").upper()
    for key, cap in _STAGE_COUNTRY_CAP.items():
        if key in s:
            return cap
    return MAX_PER_TEAM


def _solve(players: list[dict], budget: float, max_per_team: int) -> list[int] | None:
    """Return list of selected player indices, or None if infeasible."""
    try:
        import highspy
    except ImportError:
        print("[optimizer] highspy not available — falling back to greedy")
        return _greedy(players, budget, max_per_team)

    h = highspy.Highs()
    h.setOptionValue("output_flag", False)

    n = len(players)
    inf = highspy.kHighsInf

    # Binary variables
    h.addVars(n, [0.0] * n, [1.0] * n)
    kInt = highspy.HighsVarType.kInteger
    for i in range(n):
        h.changeColIntegrality(i, kInt)

    # Objective: minimize -xp (= maximize xp)
    for i, p in enumerate(players):
        h.changeColCost(i, -(p["xp"] or 0.0))

    all_idx = list(range(n))
    ones = [1.0] * n

    def add_eq(indices: list[int], rhs: float) -> None:
        h.addRow(rhs, rhs, len(indices), indices, [1.0] * len(indices))

    def add_le(indices: list[int], ub: float, coeffs: list[float] | None = None) -> None:
        if coeffs is None:
            coeffs = [1.0] * len(indices)
        h.addRow(-inf, ub, len(indices), indices, coeffs)

    # Total squad size
    add_eq(all_idx, float(SQUAD_SIZE))

    # Position quotas
    for pos, count in POS_COUNTS.items():
        idx = [i for i, p in enumerate(players) if p["position"] == pos]
        add_eq(idx, float(count))

    # Budget
    add_le(all_idx, budget, [p["price"] or 0.0 for p in players])

    # Team limits
    teams: dict[int, list[int]] = {}
    for i, p in enumerate(players):
        sid = p["squad_id"] or 0
        teams.setdefault(sid, []).append(i)
    for team_idx_list in teams.values():
        if len(team_idx_list) > max_per_team:
            add_le(team_idx_list, float(max_per_team))

    h.run()

    model_status = h.getModelStatus()
    good = (highspy.HighsModelStatus.kOptimal, highspy.HighsModelStatus.kSolutionLimit)
    if model_status not in good:
        print(f"[optimizer] HiGHS status: {model_status}")
        return None

    sol = h.getSolution()
    return [i for i, v in enumerate(sol.col_value) if v > 0.5]


def _greedy(players: list[dict], budget: float, max_per_team: int) -> list[int]:
    """Greedy fallback: best xp/price ratio while respecting constraints."""
    remaining: dict[str, int] = dict(POS_COUNTS)
    used_budget = 0.0
    team_count: dict[int, int] = {}
    selected: list[int] = []

    # Sort by xp/price descending
    order = sorted(range(len(players)), key=lambda i: (players[i]["xp"] or 0) / max(players[i]["price"] or 1, 0.1), reverse=True)

    for i in order:
        p = players[i]
        pos = p["position"] or "MID"
        if remaining.get(pos, 0) <= 0:
            continue
        if used_budget + (p["price"] or 0) > budget:
            continue
        sid = p["squad_id"] or 0
        if team_count.get(sid, 0) >= max_per_team:
            continue
        selected.append(i)
        remaining[pos] -= 1
        used_budget += p["price"] or 0
        team_count[sid] = team_count.get(sid, 0) + 1
        if len(selected) == SQUAD_SIZE:
            break

    return selected


def run_optimizer(conn: psycopg.Connection, budget: float = BUDGET_GROUP, round_id: int = 1, variant: str = "max_xp") -> None:
    print(f"[optimizer] Loading projections for round {round_id} (variant={variant})...")

    with conn.cursor() as cur:
        cur.execute("SELECT stage FROM wc.rounds WHERE id = %s", [round_id])
        stage_row = cur.fetchone()
    stage = stage_row[0] if stage_row else "GROUP"

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT p.element, p.position, p.price, p.squad_id,
                   p.known_name, p.first_name, p.last_name,
                   t.abbr AS team_abbr,
                   pr.xp, pr.low_sample
            FROM wc.players p
            LEFT JOIN wc.projections pr ON pr.element = p.element AND pr.round = %s
            LEFT JOIN wc.teams t ON t.squad_id = p.squad_id
            WHERE p.price IS NOT NULL AND p.price > 0
            """,
            [round_id],
        )
        rows = cur.fetchall()

    players = []
    for r in rows:
        element, position, price, squad_id, known, first, last, team_abbr, xp, low_sample = r
        name = known or f"{first or ''} {last or ''}".strip()
        players.append({
            "element": element,
            "position": position or "MID",
            "price": float(price or 0),
            "squad_id": squad_id,
            "name": name,
            "team_abbr": team_abbr or "???",
            "xp": float(xp or 0),
            "low_sample": bool(low_sample),
        })

    print(f"[optimizer] {len(players)} eligible players, budget £{budget}m")

    # Variant: adjust objective scores and team cap before solving
    solve_players = players
    team_cap = _country_cap(stage)
    if variant == "value":
        # Penalise expensive picks — same xP at lower price wins
        solve_players = [{**p, "xp": (p["xp"] or 0.0) - VALUE_PRICE_PENALTY * (p["price"] or 0.0)} for p in players]
    elif variant == "differential":
        # Tighter nation cap forces squad spread — fewer template picks
        team_cap = 2

    selected_idx = _solve(solve_players, budget, team_cap)

    if selected_idx is None:
        print(f"[optimizer] Infeasible at £{budget}m — retrying at £90m")
        selected_idx = _solve(solve_players, 90.0, team_cap)

    if selected_idx is None:
        print("[optimizer] ERROR: infeasible even at £90m — using greedy fallback")
        selected_idx = _greedy(solve_players, budget, team_cap)

    # Always index into original players (unmodified xp/price for storage)
    squad = [players[i] for i in selected_idx]
    total_xp = sum(p["xp"] for p in squad)
    total_cost = sum(p["price"] for p in squad)

    # Validate
    pos_counts = {}
    for p in squad:
        pos_counts[p["position"]] = pos_counts.get(p["position"], 0) + 1
    print(f"[optimizer] Squad: {pos_counts} | cost=£{total_cost:.1f}m | xP={total_xp:.2f}")

    # Build self-contained JSON blob per the agreed schema
    squad_json = [
        {
            "element": p["element"],
            "name": p["name"],
            "position": p["position"],
            "price": p["price"],
            "xp": round(p["xp"], 3),
            "team_abbr": p["team_abbr"],
            "squad_id": p["squad_id"],
            "low_sample": p["low_sample"],
        }
        for p in squad
    ]

    with conn.cursor() as cur:
        cur.execute("DELETE FROM wc.suggested_squad WHERE round = %s AND variant = %s", [round_id, variant])
        cur.execute(
            """
            INSERT INTO wc.suggested_squad (round, variant, squad_json, total_xp, total_cost, computed_at)
            VALUES (%s, %s, %s, %s, %s, NOW())
            """,
            [round_id, variant, json.dumps(squad_json), total_xp, total_cost],
        )
    conn.commit()
    print(f"[optimizer] Suggested squad written for round {round_id} (variant={variant})")


if __name__ == "__main__":
    conn = connect()
    run_optimizer(conn)
    conn.close()

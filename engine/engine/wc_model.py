"""Phase 2: compute projections from player_stats and write to wc.projections + wc.team_fdr."""

import math
import statistics
from collections import defaultdict

import httpx
import psycopg

from .config import (
    APPEARANCE_FULL,
    APPEARANCE_PART,
    CHANCES_PRIOR,
    CHANCES_PER_PT,
    CS_PTS,
    FIFA_BASE,
    GOAL_PTS,
    PENALTY_XG_PER90,
    PRIOR_WEIGHT,
    SAVES_PER_PT,
    SOT_PRIOR,
    SHOTS_PER_PT,
    TACKLES_PRIOR,
    TACKLES_PER_PT,
    XA_PRIOR,
    XG_PRIOR,
)
from .db import connect

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

POS_INT = {"GK": 1, "DEF": 2, "MID": 3, "FWD": 4}

# Minutes factor: mf = min(1, INTERCEPT + SLOPE * club_start_rate)
# WC context: starters play 90min most games; intercepts raised vs club-football defaults
MF_INTERCEPT = {"GK": 0.85, "DEF": 0.42, "MID": 0.40, "FWD": 0.38}
MF_SLOPE = {"GK": 0.12, "DEF": 0.53, "MID": 0.55, "FWD": 0.56}

# Fallback start-rate when no API-Football data; used for players with price data only
# Price-scaled logic below overrides this when price + median are available
DEFAULT_START_RATE = {"GK": 0.90, "DEF": 0.67, "MID": 0.67, "FWD": 0.65}

# Group-stage opponent difficulty by seed
SEED_LAMBDA = {1: 0.75, 2: 1.00, 3: 1.30, 4: 1.65}

# Knockout rounds use tournament average (no fixture data pre-draw)
KO_AVG_LAMBDA = statistics.mean(SEED_LAMBDA.values())   # ~1.175

# Default GK saves/90 when no StatsBomb data (WC avg shots on target faced)
DEFAULT_SAVES90 = 3.5

# Decay and discount
DECAY_PER_YEAR = 0.85
TOURNAMENT_DISCOUNT = 0.75


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _mf(pos: str, start_rate: float | None, price: float = 0.0, med_price: float = 0.0) -> float:
    if start_rate is not None:
        sr = start_rate
    elif pos == "GK":
        sr = 0.90
    elif price > 0 and med_price > 0:
        # Premium players start nearly every WC game; use price as proxy for role certainty
        # ratio=1 (median) → sr≈0.67; ratio=2+ (double median, e.g. Haaland) → sr≈0.89
        ratio = min(2.5, price / med_price)
        sr = min(0.90, 0.45 + 0.22 * ratio)
    else:
        sr = DEFAULT_START_RATE.get(pos, 0.65)
    return min(1.0, MF_INTERCEPT.get(pos, 0.40) + MF_SLOPE.get(pos, 0.55) * sr)


def _posterior(prior_val: float, prior_wt: float, sources: list[dict]) -> float:
    """Weighted Bayesian posterior from prior + weighted data sources."""
    num = prior_val * prior_wt
    den = prior_wt
    for s in sources:
        rate = s["rate"]
        weight = s["weight"]
        if weight > 0 and rate is not None:
            num += rate * weight
            den += weight
    return num / den if den > 0 else prior_val


def _group_opponents(team_row: dict, all_teams: list[dict]) -> list[dict]:
    return [
        t for t in all_teams
        if t["group_name"] == team_row["group_name"]
        and t["squad_id"] != team_row["squad_id"]
    ]


def _fetch_group_results() -> dict[int, dict]:
    """Fetch completed group stage match results from FIFA Fantasy rounds.json.

    Returns {squad_id: {goals_for: float, goals_against: float, matches: int}}
    Returns empty dict on any error (model falls back to seed-based lambdas).
    """
    try:
        resp = httpx.get(f"{FIFA_BASE}/rounds.json", timeout=15)
        resp.raise_for_status()
        rounds_data = resp.json()
    except Exception as e:
        print(f"[model] post-group FDR: failed to fetch rounds.json: {e}")
        return {}

    team_stats: dict[int, dict] = {}
    for rnd in rounds_data:
        if rnd.get("stage", "").upper() != "GROUP":
            continue
        for tournament in rnd.get("tournaments", []):
            home_id = tournament.get("homeSquadId") or tournament.get("homeId")
            away_id = tournament.get("awaySquadId") or tournament.get("awayId")
            home_score = tournament.get("homeScore")
            away_score = tournament.get("awayScore")
            if home_id is None or away_id is None:
                continue
            if home_score is None or away_score is None:
                continue  # match not yet played
            for tid, scored, conceded in [
                (int(home_id), int(home_score), int(away_score)),
                (int(away_id), int(away_score), int(home_score)),
            ]:
                if tid not in team_stats:
                    team_stats[tid] = {"goals_for": 0.0, "goals_against": 0.0, "matches": 0}
                team_stats[tid]["goals_for"] += scored
                team_stats[tid]["goals_against"] += conceded
                team_stats[tid]["matches"] += 1

    return team_stats


# ---------------------------------------------------------------------------
# Pure projection functions (no I/O — unit-testable without DB)
# ---------------------------------------------------------------------------

def compute_player_rates(
    pos: str,
    price: float,
    stats: dict,
    median_price: dict,
    is_penalty_taker: bool = False,
) -> dict:
    """Bayesian posterior xG90/xA90 and minutes factor for one player.

    Args:
        pos: position string ('GK'|'DEF'|'MID'|'FWD')
        price: FIFA Fantasy price in £m
        stats: row from player_stats (may be empty dict for players with no stats)
        median_price: {pos: median_price_float} for prior scaling
        is_penalty_taker: adds expected penalty xG to posterior

    Returns dict with keys: xg90, xa90, saves90, chances90, tackles90, sot90, mf, low_sample
    """
    pos_int = POS_INT.get(pos, 3)
    med_p = median_price.get(pos) or 6.0

    xg_prior = XG_PRIOR.get(pos_int, 0.10) * max(0.3, price / med_p)
    xa_prior = XA_PRIOR.get(pos_int, 0.05) * max(0.3, price / med_p)

    sources_xg: list[dict] = []
    sources_xa: list[dict] = []

    mf = _mf(pos, stats.get("club_start_rate"), price, median_price.get(pos) or 0.0)
    low_sample = (stats.get("club_minutes") or 0) < 180 and (stats.get("tourn_minutes") or 0) < 90

    # Club stats (recency=1, context=1)
    if stats.get("club_minutes") and (stats.get("club_goals90") is not None):
        w = stats["club_minutes"] * 1.0 * 1.0
        sources_xg.append({"rate": stats.get("club_goals90", 0.0), "weight": w})
        if stats.get("club_assists90") is not None:
            sources_xa.append({"rate": stats["club_assists90"], "weight": w})

    # Tournament stats
    tourn_weight = 0.0
    if stats.get("tourn_minutes") and (stats.get("tourn_xg90") is not None):
        age = stats.get("tourn_age_years") or 1.0
        tourn_weight = stats["tourn_minutes"] * (DECAY_PER_YEAR ** age) * TOURNAMENT_DISCOUNT
        sources_xg.append({"rate": stats["tourn_xg90"], "weight": tourn_weight})
        if stats.get("tourn_xa90") is not None:
            sources_xa.append({"rate": stats["tourn_xa90"], "weight": tourn_weight})

    xg90 = _posterior(xg_prior, PRIOR_WEIGHT * 300, sources_xg)
    xa90 = _posterior(xa_prior, PRIOR_WEIGHT * 300, sources_xa)

    # GK goals/assists are too rare at tournament level to model meaningfully
    if pos == "GK":
        xg90 = 0.0
        xa90 = 0.0

    # Penalty taker boost: ~0.35 penalties/game × 0.76 conversion ÷ 90 min
    if is_penalty_taker:
        xg90 += PENALTY_XG_PER90

    saves90: float | None = None
    if pos == "GK":
        raw = stats.get("tourn_saves90") or stats.get("club_saves90")
        saves90 = float(raw) if raw else DEFAULT_SAVES90

    # Bonus-action rates (MID: chances/tackles; FWD: shots on target)
    chances90 = 0.0
    tackles90 = 0.0
    sot90 = 0.0
    if pos == "MID":
        ch_prior = CHANCES_PRIOR.get(pos_int, 0.0) * max(0.3, price / med_p)
        tk_prior = TACKLES_PRIOR.get(pos_int, 0.0)
        src_ch = ([{"rate": stats["tourn_chances90"], "weight": tourn_weight}]
                  if tourn_weight > 0 and stats.get("tourn_chances90") is not None else [])
        src_tk = ([{"rate": stats["tourn_tackles90"], "weight": tourn_weight}]
                  if tourn_weight > 0 and stats.get("tourn_tackles90") is not None else [])
        chances90 = _posterior(ch_prior, PRIOR_WEIGHT * 300, src_ch)
        tackles90 = _posterior(tk_prior, PRIOR_WEIGHT * 300, src_tk)
    elif pos == "FWD":
        sot_prior = SOT_PRIOR.get(pos_int, 0.0) * max(0.3, price / med_p)
        src_sot = ([{"rate": stats["tourn_sot90"], "weight": tourn_weight}]
                   if tourn_weight > 0 and stats.get("tourn_sot90") is not None else [])
        sot90 = _posterior(sot_prior, PRIOR_WEIGHT * 300, src_sot)

    return {
        "xg90": xg90, "xa90": xa90, "saves90": saves90,
        "chances90": chances90, "tackles90": tackles90, "sot90": sot90,
        "mf": mf, "low_sample": low_sample,
    }


def compute_round_projection(
    pos: str,
    pos_int: int,
    xg90: float,
    xa90: float,
    saves90: float | None,
    mf: float,
    fdr: dict,
    chances90: float = 0.0,
    tackles90: float = 0.0,
    sot90: float = 0.0,
) -> dict:
    """Expected points for one player in one round given fixture difficulty.

    Args:
        pos: position string
        pos_int: integer position code (POS_INT[pos])
        xg90, xa90: posterior rates from compute_player_rates
        saves90: saves per 90 for GKs, None for outfielders
        mf: minutes factor from compute_player_rates
        fdr: {attack_lambda, concede_lambda, def_multiplier}
        chances90: MID key passes per 90 (+1 per CHANCES_PER_PT)
        tackles90: MID tackles per 90 (+1 per TACKLES_PER_PT)
        sot90: FWD shots on target per 90 (+1 per SHOTS_PER_PT)

    Returns dict with keys: xp, variance, p_goal, p_cs, p_play,
                            pcs, xg90_adj, attack_lambda, concede_lambda, def_mult
    """
    attack_lambda = fdr["attack_lambda"]
    concede_lambda = fdr["concede_lambda"]
    def_mult = fdr["def_multiplier"]

    xg90_adj = xg90 * def_mult
    pcs = math.exp(-concede_lambda)

    saves_ev = (saves90 * mf) / SAVES_PER_PT if (pos == "GK" and saves90) else 0.0
    xgc_deduct = -max(0.0, concede_lambda - 1.0) * 0.5 if pos in ("GK", "DEF") else 0.0

    xp = (
        mf * xg90_adj * GOAL_PTS.get(pos_int, 5)
        + mf * xa90 * 3
        + pcs * CS_PTS.get(pos_int, 0) * mf
        + APPEARANCE_PART * min(1.0, mf + 0.15) + APPEARANCE_PART * mf
        + saves_ev
        + xgc_deduct * mf
        + mf * chances90 / CHANCES_PER_PT
        + mf * tackles90 / TACKLES_PER_PT
        + mf * sot90 / SHOTS_PER_PT
    )

    return {
        "xp": xp,
        "variance": xp * 0.8,
        "p_goal": 1.0 - math.exp(-xg90_adj * mf),
        "p_cs": pcs * mf,
        "p_play": 1.0,
        "pcs": pcs,
        "xg90_adj": xg90_adj,
        "attack_lambda": attack_lambda,
        "concede_lambda": concede_lambda,
        "def_mult": def_mult,
    }


# ---------------------------------------------------------------------------
# Main model
# ---------------------------------------------------------------------------

def run_model(conn: psycopg.Connection, post_group: bool = False) -> None:
    print("[model] Loading data...")

    # ---- players ----
    with conn.cursor() as cur:
        cur.execute(
            "SELECT element, position, price, squad_id, is_penalty_taker FROM wc.players"
        )
        players = [
            {"element": r[0], "position": r[1], "price": r[2], "squad_id": r[3],
             "is_penalty_taker": bool(r[4])}
            for r in cur.fetchall()
        ]

    # ---- player_stats (left join) ----
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT element, club_goals90, club_assists90, club_minutes,
                   club_start_rate, club_saves90,
                   tourn_xg90, tourn_xa90, tourn_minutes, tourn_age_years,
                   tourn_saves90, tourn_source,
                   tourn_chances90, tourn_tackles90, tourn_sot90
            FROM wc.player_stats
            """
        )
        stats_map = {r[0]: dict(zip(
            ["element", "club_goals90", "club_assists90", "club_minutes",
             "club_start_rate", "club_saves90",
             "tourn_xg90", "tourn_xa90", "tourn_minutes", "tourn_age_years",
             "tourn_saves90", "tourn_source",
             "tourn_chances90", "tourn_tackles90", "tourn_sot90"],
            r
        )) for r in cur.fetchall()}

    # ---- teams ----
    with conn.cursor() as cur:
        cur.execute("SELECT squad_id, seed, group_name FROM wc.teams")
        all_teams = [{"squad_id": r[0], "seed": r[1], "group_name": r[2]}
                     for r in cur.fetchall()]

    # ---- rounds ----
    with conn.cursor() as cur:
        cur.execute("SELECT id, stage FROM wc.rounds ORDER BY id")
        rounds = [{"id": r[0], "stage": r[1]} for r in cur.fetchall()]

    # ---- median price per position (for prior scaling) ----
    pos_prices: dict[str, list[float]] = defaultdict(list)
    for p in players:
        if p["price"] and p["position"]:
            pos_prices[p["position"]].append(p["price"])
    median_price = {pos: statistics.median(prices) for pos, prices in pos_prices.items()}

    print(f"[model] {len(players)} players | {len(stats_map)} with stats | "
          f"{len(rounds)} rounds | {len(all_teams)} teams")

    # Fetch actual group results for post-group Bayesian FDR update
    group_results: dict[int, dict] = {}
    if post_group:
        print("[model] Fetching group stage results for post-group FDR update...")
        group_results = _fetch_group_results()
        print(f"[model] Group results found for {len(group_results)} teams")

    # ---- per-team FDR per round ----
    team_fdr: dict[int, dict[int, dict]] = {}
    for team in all_teams:
        squad_id = team["squad_id"]
        seed = team["seed"] or 2
        opponents = _group_opponents(team, all_teams)
        opp_seeds = [o["seed"] or 2 for o in opponents]

        group_attack_lambda = (
            statistics.mean(SEED_LAMBDA[s] for s in opp_seeds) if opp_seeds
            else KO_AVG_LAMBDA
        )
        group_concede_lambda = SEED_LAMBDA.get(seed, KO_AVG_LAMBDA)

        team_fdr[squad_id] = {}
        for rnd in rounds:
            if rnd["stage"] == "GROUP":
                team_fdr[squad_id][rnd["id"]] = {
                    "attack_lambda": group_attack_lambda,
                    "concede_lambda": group_concede_lambda,
                    "def_multiplier": 1.0,
                }
            else:
                team_fdr[squad_id][rnd["id"]] = {
                    "attack_lambda": KO_AVG_LAMBDA,
                    "concede_lambda": KO_AVG_LAMBDA,
                    "def_multiplier": 1.0,
                }

    # ---- post-group Bayesian FDR update (knockout rounds only) ----
    if post_group and group_results:
        total_goals = sum(s["goals_for"] for s in group_results.values())
        total_matches = sum(s["matches"] for s in group_results.values())
        tourn_avg_gpg = (total_goals / total_matches) if total_matches > 0 else 1.3
        prior_virt = 3  # equivalent to 3 virtual matches of prior evidence

        for squad_id in team_fdr:
            result = group_results.get(squad_id)
            if not result or result["matches"] == 0:
                continue
            m = result["matches"]
            actual_gf = result["goals_for"] / m
            actual_ga = result["goals_against"] / m

            for rnd_id, fdr_entry in team_fdr[squad_id].items():
                rnd = next((r for r in rounds if r["id"] == rnd_id), None)
                if not rnd or rnd["stage"] == "GROUP":
                    continue  # only update knockout rounds

                # Bayesian blend: KO_AVG_LAMBDA prior + actual group concede rate
                concede_post = (prior_virt * KO_AVG_LAMBDA + m * actual_ga) / (prior_virt + m)
                # def_multiplier: team's attacking output vs tournament average
                def_mult_post = actual_gf / tourn_avg_gpg if tourn_avg_gpg > 0 else 1.0

                team_fdr[squad_id][rnd_id] = {
                    "attack_lambda": KO_AVG_LAMBDA,
                    "concede_lambda": concede_post,
                    "def_multiplier": def_mult_post,
                }

        print(f"[model] Post-group FDR updated. Tournament avg goals/game: {tourn_avg_gpg:.2f}")

    # ---- compute projections ----
    proj_rows: list[tuple] = []
    fdr_rows: list[tuple] = []
    seen_fdr: set[tuple] = set()

    for p in players:
        pos = p["position"] or "MID"
        pos_int = POS_INT.get(pos, 3)
        price = p["price"] or 0.0
        squad_id = p["squad_id"]
        element = p["element"]

        rates = compute_player_rates(
            pos, price, stats_map.get(element, {}), median_price,
            p["is_penalty_taker"],
        )

        for rnd in rounds:
            fdr = team_fdr.get(squad_id, {}).get(rnd["id"], {
                "attack_lambda": KO_AVG_LAMBDA,
                "concede_lambda": KO_AVG_LAMBDA,
                "def_multiplier": 1.0,
            })
            proj = compute_round_projection(
                pos, pos_int,
                rates["xg90"], rates["xa90"], rates["saves90"],
                rates["mf"], fdr,
                rates["chances90"], rates["tackles90"], rates["sot90"],
            )

            proj_rows.append((
                element, rnd["id"],
                rates["mf"], proj["p_play"],
                rates["xg90"], rates["xa90"],
                proj["attack_lambda"], proj["pcs"], proj["def_mult"],
                proj["xp"], proj["variance"], proj["p_goal"], proj["p_cs"],
                rates["low_sample"],
            ))

            fdr_key = (squad_id, rnd["id"])
            if fdr_key not in seen_fdr and squad_id:
                seen_fdr.add(fdr_key)
                fdr_rows.append((
                    squad_id, rnd["id"],
                    proj["attack_lambda"], proj["def_mult"],
                    None, proj["concede_lambda"], None, proj["concede_lambda"],
                ))

    print(f"[model] Writing {len(proj_rows)} projection rows...")
    with conn.cursor() as cur:
        cur.execute("DELETE FROM wc.projections")
        cur.executemany(
            """
            INSERT INTO wc.projections
                (element, round, mf, p_play, xg90_posterior, xa90_posterior,
                 lambda_posterior, pcs, defensive_multiplier,
                 xp, variance, p_goal, p_cs, low_sample, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
            """,
            proj_rows,
        )
        cur.execute("DELETE FROM wc.team_fdr")
        cur.executemany(
            """
            INSERT INTO wc.team_fdr
                (squad_id, round, lambda_posterior, def_multiplier,
                 xg_created_pg, xgc_pg, goals_pg, goals_conceded_pg, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
            """,
            fdr_rows,
        )
    conn.commit()
    print(f"[model] Done. {len(proj_rows)} projections, {len(fdr_rows)} team_fdr rows.")


def blend_live_observations(conn: psycopg.Connection) -> None:
    """Blend prior xP with FIFA Fantasy avgPoints after rounds are played.

    PRD Option A2: xp_blended = (prior_xp * 300 + avg_pts_pg * rounds_played * 90)
                              / (300 + rounds_played * 90)

    Prior fades to ~25% after round 5. Zero-op when no rounds are complete.
    """
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM wc.rounds WHERE status = 'COMPLETE'")
        row = cur.fetchone()
    rounds_played: int = row[0] if row else 0

    if rounds_played == 0:
        print("[model] blend_live_observations: 0 rounds complete, skipping")
        return

    obs_weight = rounds_played * 90
    prior_weight = 300

    try:
        resp = httpx.get(f"{FIFA_BASE}/players.json", timeout=15)
        resp.raise_for_status()
        fifa_players = resp.json()
    except Exception as e:
        print(f"[model] blend_live_observations: failed to fetch players.json: {e}")
        return

    avg_pts_map: dict[int, float] = {}
    for fp in fifa_players:
        el = fp.get("id")
        stats = fp.get("stats") or {}
        avg_pts = stats.get("avgPoints")
        if el is not None and avg_pts is not None:
            avg_pts_map[int(el)] = float(avg_pts)

    if not avg_pts_map:
        print("[model] blend_live_observations: no avgPoints in players.json, skipping")
        return

    with conn.cursor() as cur:
        cur.execute("SELECT DISTINCT round FROM wc.projections")
        round_ids = [r[0] for r in cur.fetchall()]

    total_updated = 0
    for round_id in round_ids:
        with conn.cursor() as cur:
            cur.execute("SELECT element, xp FROM wc.projections WHERE round = %s", [round_id])
            rows = cur.fetchall()

        updates = []
        for element, prior_xp in rows:
            avg_pts = avg_pts_map.get(element)
            if avg_pts is None or prior_xp is None:
                continue
            blended = (prior_xp * prior_weight + avg_pts * obs_weight) / (prior_weight + obs_weight)
            updates.append((blended, element, round_id))

        if updates:
            with conn.cursor() as cur:
                cur.executemany(
                    "UPDATE wc.projections SET xp = %s, updated_at = NOW() "
                    "WHERE element = %s AND round = %s",
                    updates,
                )
            total_updated += len(updates)

    conn.commit()
    print(
        f"[model] blend_live_observations: {total_updated} projections blended "
        f"(rounds_played={rounds_played}, obs_weight={obs_weight}, prior_weight={prior_weight})"
    )


if __name__ == "__main__":
    conn = connect()
    run_model(conn)
    conn.close()

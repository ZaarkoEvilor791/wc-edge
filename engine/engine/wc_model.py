"""Phase 2: compute projections from player_stats and write to wc.projections + wc.team_fdr."""

import math
import statistics
from collections import defaultdict

import psycopg

from .config import (
    APPEARANCE_FULL,
    CS_PTS,
    GOAL_PTS,
    PRIOR_WEIGHT,
    SAVES_PER_PT,
    XA_PRIOR,
    XG_PRIOR,
)
from .db import connect

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

POS_INT = {"GK": 1, "DEF": 2, "MID": 3, "FWD": 4}

# Minutes factor: mf = min(1, INTERCEPT + SLOPE * club_start_rate)
MF_INTERCEPT = {"GK": 0.85, "DEF": 0.20, "MID": 0.18, "FWD": 0.15}
MF_SLOPE = {"GK": 0.12, "DEF": 0.72, "MID": 0.68, "FWD": 0.64}

# Default club_start_rate when NULL (no API-Football data)
DEFAULT_START_RATE = {"GK": 0.90, "DEF": 0.55, "MID": 0.55, "FWD": 0.50}

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

def _mf(pos: str, start_rate: float | None) -> float:
    sr = start_rate if start_rate is not None else DEFAULT_START_RATE.get(pos, 0.5)
    return min(1.0, MF_INTERCEPT.get(pos, 0.18) + MF_SLOPE.get(pos, 0.65) * sr)


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


# ---------------------------------------------------------------------------
# Pure projection functions (no I/O — unit-testable without DB)
# ---------------------------------------------------------------------------

def compute_player_rates(
    pos: str,
    price: float,
    stats: dict,
    median_price: dict,
) -> dict:
    """Bayesian posterior xG90/xA90 and minutes factor for one player.

    Args:
        pos: position string ('GK'|'DEF'|'MID'|'FWD')
        price: FIFA Fantasy price in £m
        stats: row from player_stats (may be empty dict for players with no stats)
        median_price: {pos: median_price_float} for prior scaling

    Returns dict with keys: xg90, xa90, saves90, mf, low_sample
    """
    pos_int = POS_INT.get(pos, 3)
    med_p = median_price.get(pos) or 6.0

    xg_prior = XG_PRIOR.get(pos_int, 0.10) * max(0.3, price / med_p)
    xa_prior = XA_PRIOR.get(pos_int, 0.05) * max(0.3, price / med_p)

    sources_xg: list[dict] = []
    sources_xa: list[dict] = []

    mf = _mf(pos, stats.get("club_start_rate"))
    low_sample = (stats.get("club_minutes") or 0) < 180 and (stats.get("tourn_minutes") or 0) < 90

    # Club stats (recency=1, context=1)
    if stats.get("club_minutes") and (stats.get("club_goals90") is not None):
        w = stats["club_minutes"] * 1.0 * 1.0
        sources_xg.append({"rate": stats.get("club_goals90", 0.0), "weight": w})
        if stats.get("club_assists90") is not None:
            sources_xa.append({"rate": stats["club_assists90"], "weight": w})

    # Tournament stats
    if stats.get("tourn_minutes") and (stats.get("tourn_xg90") is not None):
        age = stats.get("tourn_age_years") or 1.0
        w = stats["tourn_minutes"] * (DECAY_PER_YEAR ** age) * TOURNAMENT_DISCOUNT
        sources_xg.append({"rate": stats["tourn_xg90"], "weight": w})
        if stats.get("tourn_xa90") is not None:
            sources_xa.append({"rate": stats["tourn_xa90"], "weight": w})

    xg90 = _posterior(xg_prior, PRIOR_WEIGHT * 300, sources_xg)
    xa90 = _posterior(xa_prior, PRIOR_WEIGHT * 300, sources_xa)

    saves90: float | None = None
    if pos == "GK":
        raw = stats.get("tourn_saves90") or stats.get("club_saves90")
        saves90 = float(raw) if raw else DEFAULT_SAVES90

    return {"xg90": xg90, "xa90": xa90, "saves90": saves90, "mf": mf, "low_sample": low_sample}


def compute_round_projection(
    pos: str,
    pos_int: int,
    xg90: float,
    xa90: float,
    saves90: float | None,
    mf: float,
    fdr: dict,
) -> dict:
    """Expected points for one player in one round given fixture difficulty.

    Args:
        pos: position string
        pos_int: integer position code (POS_INT[pos])
        xg90, xa90: posterior rates from compute_player_rates
        saves90: saves per 90 for GKs, None for outfielders
        mf: minutes factor from compute_player_rates
        fdr: {attack_lambda, concede_lambda, def_multiplier}

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
        + APPEARANCE_FULL * mf
        + saves_ev
        + xgc_deduct * mf
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

def run_model(conn: psycopg.Connection) -> None:
    print("[model] Loading data...")

    # ---- players ----
    with conn.cursor() as cur:
        cur.execute(
            "SELECT element, position, price, squad_id FROM wc.players"
        )
        players = [
            {"element": r[0], "position": r[1], "price": r[2], "squad_id": r[3]}
            for r in cur.fetchall()
        ]

    # ---- player_stats (left join) ----
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT element, club_goals90, club_assists90, club_minutes,
                   club_start_rate, club_saves90,
                   tourn_xg90, tourn_xa90, tourn_minutes, tourn_age_years,
                   tourn_saves90, tourn_source
            FROM wc.player_stats
            """
        )
        stats_map = {r[0]: dict(zip(
            ["element", "club_goals90", "club_assists90", "club_minutes",
             "club_start_rate", "club_saves90",
             "tourn_xg90", "tourn_xa90", "tourn_minutes", "tourn_age_years",
             "tourn_saves90", "tourn_source"],
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

        rates = compute_player_rates(pos, price, stats_map.get(element, {}), median_price)

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


if __name__ == "__main__":
    conn = connect()
    run_model(conn)
    conn.close()

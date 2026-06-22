"""Orchestrator: Phase 1 (ingest) + Phase 2 (model) + Phase 3 (optimizer)."""

import argparse

import httpx

from .config import BUDGET_GROUP, BUDGET_R32
from .db import connect, init_schema
from .wc_model import blend_live_observations, run_model, update_round_fdr
from .wc_optimizer import run_optimizer

_FIFA_ROUNDS_URL = "https://play.fifa.com/json/fantasy/rounds.json"


def _sync_round_statuses(conn) -> None:
    """Fetch FIFA Fantasy rounds.json and update DB status for any changed rounds.

    Non-fatal — if the fetch fails, logs a warning and proceeds with DB as-is.
    Runs on every engine invocation so blend_live_observations activates without
    needing a full wc_ingest run.
    """
    try:
        resp = httpx.get(_FIFA_ROUNDS_URL, timeout=10)
        resp.raise_for_status()
        rounds = resp.json()
    except Exception as e:
        print(f"[sync_rounds] WARNING: could not fetch rounds.json: {e}")
        return

    updated = 0
    with conn.cursor() as cur:
        for r in rounds:
            rid = r.get("id")
            status = (r.get("status") or "").lower()
            if rid is None or not status:
                continue
            cur.execute(
                "UPDATE wc.rounds SET status = %s, updated_at = NOW() "
                "WHERE id = %s AND status IS DISTINCT FROM %s",
                (status, rid, status),
            )
            updated += cur.rowcount
    conn.commit()
    print(f"[sync_rounds] Synced {len(rounds)} rounds, {updated} status update(s)")


def _detect_round_and_budget(conn) -> tuple[int, float]:
    """Return (round_id, budget) for the next upcoming round, reading from DB.

    Picks the earliest non-COMPLETE round. Budget is £100m for GROUP stage,
    £105m for R32 and beyond. Falls back to round 1 / £100m if rounds table is empty.
    """
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, stage FROM wc.rounds WHERE LOWER(status) != 'complete' ORDER BY id LIMIT 1"
        )
        row = cur.fetchone()

    if not row:
        # All rounds complete — use last round
        with conn.cursor() as cur:
            cur.execute("SELECT id, stage FROM wc.rounds ORDER BY id DESC LIMIT 1")
            row = cur.fetchone()

    if not row:
        return 1, BUDGET_GROUP

    round_id, stage = row
    budget = BUDGET_GROUP if (stage or "GROUP").upper() == "GROUP" else BUDGET_R32
    return round_id, budget


def main() -> None:
    parser = argparse.ArgumentParser(description="wc-edge full pipeline runner")
    parser.add_argument(
        "--phase",
        choices=["model", "optimizer", "all"],
        default="all",
        help="Which phase to run (default: all = model + optimizer)",
    )
    parser.add_argument(
        "--round",
        type=int,
        default=None,
        help="Round to optimize for (default: auto-detected from DB)",
    )
    parser.add_argument(
        "--post-group",
        action="store_true",
        help="Apply post-group Bayesian FDR update using actual group stage results",
    )
    args = parser.parse_args()

    conn = connect()
    init_schema(conn)
    _sync_round_statuses(conn)

    round_id, budget = _detect_round_and_budget(conn)
    if args.round is not None:
        round_id = args.round
        # Re-derive budget from DB stage if round is overridden
        with conn.cursor() as cur:
            cur.execute("SELECT stage FROM wc.rounds WHERE id = %s", [round_id])
            row = cur.fetchone()
        if row:
            budget = BUDGET_GROUP if (row[0] or "GROUP").upper() == "GROUP" else BUDGET_R32

    print(f"[run] Round {round_id} | Budget £{budget}m | post_group={args.post_group}")

    if args.phase in ("model", "all"):
        run_model(conn, post_group=args.post_group)
        blend_live_observations(conn)
        update_round_fdr(conn)

    if args.phase in ("optimizer", "all"):
        for variant in ("max_xp", "value", "differential"):
            run_optimizer(conn, budget=budget, round_id=round_id, variant=variant)

    conn.close()
    print("[run] Pipeline complete.")


if __name__ == "__main__":
    main()

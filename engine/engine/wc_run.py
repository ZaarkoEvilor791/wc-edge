"""Orchestrator: Phase 1 (ingest) + Phase 2 (model) + Phase 3 (optimizer)."""

import argparse

from .config import BUDGET_GROUP, BUDGET_R32
from .db import connect, init_schema
from .wc_model import blend_live_observations, run_model
from .wc_optimizer import run_optimizer


def _detect_round_and_budget(conn) -> tuple[int, float]:
    """Return (round_id, budget) for the next upcoming round, reading from DB.

    Picks the earliest non-COMPLETE round. Budget is £100m for GROUP stage,
    £105m for R32 and beyond. Falls back to round 1 / £100m if rounds table is empty.
    """
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, stage FROM wc.rounds WHERE status != 'COMPLETE' ORDER BY id LIMIT 1"
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

    if args.phase in ("optimizer", "all"):
        run_optimizer(conn, budget=budget, round_id=round_id)

    conn.close()
    print("[run] Pipeline complete.")


if __name__ == "__main__":
    main()

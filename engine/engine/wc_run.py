"""Orchestrator: Phase 1 (ingest) + Phase 2 (model) + Phase 3 (optimizer)."""

import argparse

from .db import connect, init_schema
from .wc_model import run_model
from .wc_optimizer import run_optimizer


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
        default=1,
        help="Round to optimize for (default: 1)",
    )
    args = parser.parse_args()

    conn = connect()
    init_schema(conn)

    if args.phase in ("model", "all"):
        run_model(conn)

    if args.phase in ("optimizer", "all"):
        run_optimizer(conn, round_id=args.round)

    conn.close()
    print("[run] Pipeline complete.")


if __name__ == "__main__":
    main()

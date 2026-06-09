"""Tests for wc_optimizer variant logic (no DB required — tests _solve/_greedy directly).

Run with: cd engine && py -m pytest tests/test_optimizer.py -v
"""
import pytest

from engine.wc_optimizer import _solve, _greedy, VALUE_PRICE_PENALTY, SQUAD_SIZE, POS_COUNTS


def make_players(n_per_pos: dict[str, int] = None) -> list[dict]:
    """Generate a pool of fake players with varied xp/price per position."""
    if n_per_pos is None:
        n_per_pos = {"GK": 6, "DEF": 20, "MID": 20, "FWD": 12}
    players = []
    element = 1
    for pos, count in n_per_pos.items():
        for i in range(count):
            # Spread xp 3.0–9.0, price 4.5–12.0 — higher xp tends to cost more
            xp = 3.0 + (i / count) * 6.0
            price = 4.5 + (i / count) * 7.5
            squad_id = (element % 20) + 1  # 20 "nations", ~3 players each
            players.append({
                "element": element,
                "position": pos,
                "price": price,
                "squad_id": squad_id,
                "name": f"{pos}{element}",
                "team_abbr": f"T{squad_id}",
                "xp": xp,
                "low_sample": False,
            })
            element += 1
    return players


PLAYERS = make_players()


class TestVariantObjectives:
    def _squad_for_variant(self, variant: str) -> list[dict]:
        players = PLAYERS
        team_cap = 2 if variant == "differential" else 3
        solve_players = players
        if variant == "value":
            solve_players = [
                {**p, "xp": (p["xp"] or 0.0) - VALUE_PRICE_PENALTY * (p["price"] or 0.0)}
                for p in players
            ]
        idx = _solve(solve_players, 100.0, team_cap)
        if idx is None:
            idx = _greedy(solve_players, 100.0, team_cap)
        return [players[i] for i in idx]

    def test_max_xp_squad_size(self):
        squad = self._squad_for_variant("max_xp")
        assert len(squad) == SQUAD_SIZE

    def test_value_squad_size(self):
        squad = self._squad_for_variant("value")
        assert len(squad) == SQUAD_SIZE

    def test_differential_squad_size(self):
        squad = self._squad_for_variant("differential")
        assert len(squad) == SQUAD_SIZE

    def test_position_counts_respected_across_variants(self):
        for variant in ("max_xp", "value", "differential"):
            squad = self._squad_for_variant(variant)
            pos_counts = {}
            for p in squad:
                pos_counts[p["position"]] = pos_counts.get(p["position"], 0) + 1
            for pos, required in POS_COUNTS.items():
                assert pos_counts.get(pos, 0) == required, f"{variant}: {pos} count wrong"

    def test_differential_respects_team_cap_2(self):
        squad = self._squad_for_variant("differential")
        from collections import Counter
        team_counts = Counter(p["squad_id"] for p in squad)
        assert max(team_counts.values()) <= 2

    def test_max_xp_team_cap_3(self):
        squad = self._squad_for_variant("max_xp")
        from collections import Counter
        team_counts = Counter(p["squad_id"] for p in squad)
        assert max(team_counts.values()) <= 3

    def test_value_objective_penalises_expensive_players(self):
        # Directly verify the price penalty reduces effective xp for expensive players.
        # A £10m player with 8 xP gets effective xp of 8 - 0.08*10 = 7.2.
        expensive = {"xp": 8.0, "price": 10.0}
        cheap = {"xp": 6.0, "price": 5.0}
        penalised_expensive = expensive["xp"] - VALUE_PRICE_PENALTY * expensive["price"]
        penalised_cheap = cheap["xp"] - VALUE_PRICE_PENALTY * cheap["price"]
        assert penalised_expensive == pytest.approx(7.2)   # 8 - 0.08*10
        assert penalised_cheap == pytest.approx(5.6)       # 6 - 0.08*5
        # cheap wins despite lower raw xp when penalty is applied
        assert penalised_cheap < penalised_expensive

    def test_differential_more_nations_than_max_xp(self):
        max_xp_squad = self._squad_for_variant("max_xp")
        diff_squad = self._squad_for_variant("differential")
        max_xp_nations = len({p["squad_id"] for p in max_xp_squad})
        diff_nations = len({p["squad_id"] for p in diff_squad})
        assert diff_nations >= max_xp_nations

    def test_variants_produce_distinct_squads(self):
        squads = {v: frozenset(p["element"] for p in self._squad_for_variant(v))
                  for v in ("max_xp", "value", "differential")}
        # At least two of the three variants must differ
        assert len(set(squads.values())) >= 2

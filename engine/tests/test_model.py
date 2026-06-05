"""Tests for pure projection functions in wc_model.py.

Run with: cd engine && py -m pytest tests/ -v
"""
import math
import pytest

from engine.wc_model import compute_player_rates, compute_round_projection, SEED_LAMBDA, KO_AVG_LAMBDA

MEDIAN_PRICE = {"GK": 5.0, "DEF": 5.5, "MID": 7.0, "FWD": 8.0}

EASY_FDR = {"attack_lambda": SEED_LAMBDA[1], "concede_lambda": SEED_LAMBDA[4], "def_multiplier": 1.2}
HARD_FDR = {"attack_lambda": SEED_LAMBDA[4], "concede_lambda": SEED_LAMBDA[1], "def_multiplier": 0.8}
AVG_FDR  = {"attack_lambda": KO_AVG_LAMBDA, "concede_lambda": KO_AVG_LAMBDA, "def_multiplier": 1.0}


# ---------------------------------------------------------------------------
# compute_player_rates
# ---------------------------------------------------------------------------

class TestComputePlayerRates:
    def test_returns_all_expected_keys(self):
        rates = compute_player_rates("MID", 7.0, {}, MEDIAN_PRICE)
        assert set(rates) >= {"xg90", "xa90", "saves90", "mf", "low_sample"}

    def test_no_stats_uses_prior(self):
        rates = compute_player_rates("MID", 7.0, {}, MEDIAN_PRICE)
        assert rates["xg90"] > 0
        assert rates["xa90"] > 0
        assert rates["low_sample"] is True  # no club or tourn minutes

    def test_club_stats_pull_posterior_toward_data(self):
        no_stats = compute_player_rates("FWD", 8.0, {}, MEDIAN_PRICE)
        with_goals = compute_player_rates("FWD", 8.0, {
            "club_goals90": 0.8, "club_minutes": 2000,
            "club_assists90": 0.2, "club_start_rate": 0.9,
        }, MEDIAN_PRICE)
        assert with_goals["xg90"] > no_stats["xg90"]

    def test_low_sample_false_when_enough_minutes(self):
        rates = compute_player_rates("MID", 7.0, {
            "club_minutes": 2000, "club_goals90": 0.3, "club_start_rate": 0.8,
        }, MEDIAN_PRICE)
        assert rates["low_sample"] is False

    def test_gk_gets_default_saves_when_no_data(self):
        rates = compute_player_rates("GK", 5.0, {}, MEDIAN_PRICE)
        assert rates["saves90"] == pytest.approx(3.5)

    def test_gk_uses_actual_saves_when_available(self):
        rates = compute_player_rates("GK", 5.0, {"tourn_saves90": 5.0}, MEDIAN_PRICE)
        assert rates["saves90"] == pytest.approx(5.0)

    def test_outfielder_saves90_is_none(self):
        for pos in ("DEF", "MID", "FWD"):
            rates = compute_player_rates(pos, 6.0, {}, MEDIAN_PRICE)
            assert rates["saves90"] is None

    def test_mf_increases_with_start_rate(self):
        low = compute_player_rates("MID", 7.0, {"club_start_rate": 0.3}, MEDIAN_PRICE)
        high = compute_player_rates("MID", 7.0, {"club_start_rate": 0.9}, MEDIAN_PRICE)
        assert high["mf"] > low["mf"]

    def test_expensive_player_has_higher_prior_xg(self):
        cheap = compute_player_rates("FWD", 5.0, {}, MEDIAN_PRICE)
        expensive = compute_player_rates("FWD", 14.0, {}, MEDIAN_PRICE)
        assert expensive["xg90"] > cheap["xg90"]


# ---------------------------------------------------------------------------
# compute_round_projection
# ---------------------------------------------------------------------------

class TestComputeRoundProjection:
    def _rates(self, pos="MID"):
        return compute_player_rates(pos, 7.0, {
            "club_goals90": 0.3, "club_assists90": 0.15, "club_minutes": 2000,
            "club_start_rate": 0.85,
        }, MEDIAN_PRICE)

    def test_returns_all_expected_keys(self):
        proj = compute_round_projection("MID", 3, 0.3, 0.1, None, 0.9, AVG_FDR)
        assert set(proj) >= {"xp", "variance", "p_goal", "p_cs", "p_play", "pcs"}

    def test_xp_positive(self):
        proj = compute_round_projection("MID", 3, 0.3, 0.1, None, 0.9, AVG_FDR)
        assert proj["xp"] > 0

    def test_easy_fixture_gives_higher_xp_than_hard(self):
        rates = self._rates("MID")
        easy = compute_round_projection("MID", 3, rates["xg90"], rates["xa90"], None, rates["mf"], EASY_FDR)
        hard = compute_round_projection("MID", 3, rates["xg90"], rates["xa90"], None, rates["mf"], HARD_FDR)
        assert easy["xp"] > hard["xp"]

    def test_def_multiplier_scales_xg_adj(self):
        proj_high = compute_round_projection("MID", 3, 0.3, 0.1, None, 0.9, {**AVG_FDR, "def_multiplier": 1.5})
        proj_low  = compute_round_projection("MID", 3, 0.3, 0.1, None, 0.9, {**AVG_FDR, "def_multiplier": 0.5})
        assert proj_high["xg90_adj"] > proj_low["xg90_adj"]

    def test_gk_clean_sheet_pts_count(self):
        rates = self._rates("GK")
        proj = compute_round_projection("GK", 1, rates["xg90"], rates["xa90"], 3.5, rates["mf"], AVG_FDR)
        assert proj["xp"] > 0
        assert proj["p_cs"] > 0

    def test_variance_is_80pct_of_xp(self):
        proj = compute_round_projection("FWD", 4, 0.4, 0.1, None, 0.9, AVG_FDR)
        assert proj["variance"] == pytest.approx(proj["xp"] * 0.8)

    def test_p_goal_between_0_and_1(self):
        proj = compute_round_projection("FWD", 4, 0.4, 0.1, None, 0.9, AVG_FDR)
        assert 0 < proj["p_goal"] < 1

    def test_p_play_is_always_1(self):
        proj = compute_round_projection("MID", 3, 0.3, 0.1, None, 0.9, AVG_FDR)
        assert proj["p_play"] == 1.0

    def test_def_gets_xgc_deduction_vs_strong_opponent(self):
        # concede_lambda > 1 → xgc_deduct is negative → reduces xp
        high_concede = {**AVG_FDR, "concede_lambda": 2.0}
        low_concede  = {**AVG_FDR, "concede_lambda": 0.5}
        rates = self._rates("DEF")
        high = compute_round_projection("DEF", 2, rates["xg90"], rates["xa90"], None, rates["mf"], high_concede)
        low  = compute_round_projection("DEF", 2, rates["xg90"], rates["xa90"], None, rates["mf"], low_concede)
        assert low["xp"] > high["xp"]

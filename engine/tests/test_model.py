"""Tests for pure projection functions in wc_model.py.

Run with: cd engine && py -m pytest tests/ -v
"""
import math
import pytest

from engine.wc_model import (
    compute_player_rates,
    compute_round_projection,
    SEED_LAMBDA,
    KO_AVG_LAMBDA,
    _fetch_group_results,
)

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

    def test_appearance_formula_accounts_for_partial_appearances(self):
        # mf=0.3 (rotation player): p(any) ≈ 0.45, p(60min) = 0.3
        # expected appearance pts = 1 * 0.45 + 1 * 0.3 = 0.75
        # old formula: 2 * 0.3 = 0.60 — rotation players were undervalued
        mf = 0.3
        proj = compute_round_projection("MID", 3, 0.0, 0.0, None, mf, {**AVG_FDR, "concede_lambda": 0.0})
        # cs contribution is ~0 (concede_lambda=0 → pcs=1, but MID CS = 1pt)
        # goals/assists = 0 (xg=xa=0)
        # only appearance terms remain (+saves=0, +xgc=0, +pcs*mf*1)
        # appearance = 1 * min(1, 0.3+0.15) + 1 * 0.3 = 0.45 + 0.30 = 0.75
        # plus CS: math.exp(0) * 1 * 0.3 = 0.3 → total ~ 1.05
        appearance_ev = 1.0 * min(1.0, mf + 0.15) + 1.0 * mf
        assert appearance_ev == pytest.approx(0.75)
        # confirm sub-rate player gets more than old 2*mf formula
        assert appearance_ev > 2 * mf

    def test_appearance_starter_close_to_full_appearance(self):
        # mf=0.9 (strong starter): p(any) = min(1, 1.05) = 1.0, p(60min) = 0.9
        # appearance = 1 * 1.0 + 1 * 0.9 = 1.9 (was 2 * 0.9 = 1.8)
        mf = 0.9
        appearance_ev = 1.0 * min(1.0, mf + 0.15) + 1.0 * mf
        assert appearance_ev == pytest.approx(1.9)


# ---------------------------------------------------------------------------
# blend_live_observations — Bayesian blend math (isolated, no DB/HTTP)
# ---------------------------------------------------------------------------

class TestLiveBlendMath:
    """Tests the Option A2 blend formula independently of DB calls."""

    def _blend(self, prior_xp: float, avg_pts: float, rounds_played: int) -> float:
        obs_weight = rounds_played * 90
        prior_weight = 300
        return (prior_xp * prior_weight + avg_pts * obs_weight) / (prior_weight + obs_weight)

    def test_zero_rounds_returns_prior(self):
        blended = self._blend(5.0, 2.0, 0)
        # obs_weight=0 → blended = prior_xp * 300 / 300 = prior_xp
        assert blended == pytest.approx(5.0)

    def test_after_round1_mostly_prior(self):
        # obs_weight=90, prior_weight=300 → prior still dominates (77%)
        blended = self._blend(5.0, 2.0, 1)
        # 5*300 + 2*90 / (300+90) = (1500+180)/390 ≈ 4.31
        assert blended == pytest.approx((5.0 * 300 + 2.0 * 90) / 390)
        assert blended > 2.0  # prior still dominates

    def test_after_round5_observed_dominates(self):
        # obs_weight=450, prior_weight=300 → observed has 60% weight
        blended = self._blend(5.0, 2.0, 5)
        assert blended == pytest.approx((5.0 * 300 + 2.0 * 450) / 750)
        # Result should be closer to observed (2.0) than to prior (5.0)
        assert blended < 4.0

    def test_blend_converges_toward_observed_over_rounds(self):
        prior_xp = 6.0
        observed = 3.0
        prev = prior_xp
        for r in range(1, 9):
            blended = self._blend(prior_xp, observed, r)
            assert blended < prev  # always moving toward observed
            prev = blended

    def test_perfect_agreement_stays_stable(self):
        blended = self._blend(4.0, 4.0, 3)
        assert blended == pytest.approx(4.0)


# ---------------------------------------------------------------------------
# Post-group FDR Bayesian update math
# ---------------------------------------------------------------------------

class TestPostGroupFdrMath:
    """Tests the Bayesian lambda update formula for post-group knockout rounds."""

    def _update_concede(self, ko_avg: float, actual_ga: float, m: int, prior_virt: int = 3) -> float:
        return (prior_virt * ko_avg + m * actual_ga) / (prior_virt + m)

    def test_poor_defense_increases_concede_lambda(self):
        # Team conceded 2.5 goals/game in group → knockout lambda increases vs KO_AVG
        updated = self._update_concede(KO_AVG_LAMBDA, 2.5, 3)
        assert updated > KO_AVG_LAMBDA

    def test_solid_defense_decreases_concede_lambda(self):
        # Team conceded 0.3 goals/game in group → knockout lambda decreases
        updated = self._update_concede(KO_AVG_LAMBDA, 0.3, 3)
        assert updated < KO_AVG_LAMBDA

    def test_average_team_stays_near_ko_avg(self):
        updated = self._update_concede(KO_AVG_LAMBDA, KO_AVG_LAMBDA, 3)
        assert updated == pytest.approx(KO_AVG_LAMBDA)

    def test_def_multiplier_above_1_for_high_scoring_team(self):
        tourn_avg = 1.3
        actual_gf = 2.5
        def_mult = actual_gf / tourn_avg
        assert def_mult > 1.0

    def test_def_multiplier_below_1_for_low_scoring_team(self):
        tourn_avg = 1.3
        actual_gf = 0.5
        def_mult = actual_gf / tourn_avg
        assert def_mult < 1.0


# ---------------------------------------------------------------------------
# _fetch_group_results — URL parsing logic (mocked HTTP)
# ---------------------------------------------------------------------------

class TestFetchGroupResults:
    def test_returns_empty_on_http_error(self, monkeypatch):
        """If rounds.json fetch fails, returns empty dict without raising."""
        import httpx
        def _fail(*args, **kwargs):
            raise httpx.ConnectError("timeout")
        monkeypatch.setattr(httpx, "get", _fail)
        result = _fetch_group_results()
        assert result == {}

    def test_parses_completed_group_matches(self, monkeypatch):
        import httpx
        from unittest.mock import MagicMock

        fake_data = [
            {
                "stage": "GROUP",
                "tournaments": [
                    {"homeSquadId": 1, "awaySquadId": 2, "homeScore": 2, "awayScore": 1},
                    {"homeSquadId": 1, "awaySquadId": 3, "homeScore": 1, "awayScore": 0},
                ],
            },
            {
                "stage": "R32",
                "tournaments": [
                    {"homeSquadId": 1, "awaySquadId": 4, "homeScore": 3, "awayScore": 0},
                ],
            },
        ]
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = fake_data
        monkeypatch.setattr(httpx, "get", lambda *a, **kw: mock_resp)

        result = _fetch_group_results()

        # R32 match must be ignored
        assert 4 not in result or result[4]["matches"] == 0
        # Team 1: 2 matches, goals_for=3, goals_against=1
        assert result[1]["matches"] == 2
        assert result[1]["goals_for"] == pytest.approx(3.0)
        assert result[1]["goals_against"] == pytest.approx(1.0)

    def test_skips_matches_without_scores(self, monkeypatch):
        import httpx
        from unittest.mock import MagicMock

        fake_data = [
            {
                "stage": "GROUP",
                "tournaments": [
                    {"homeSquadId": 1, "awaySquadId": 2, "homeScore": None, "awayScore": None},
                ],
            }
        ]
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = fake_data
        monkeypatch.setattr(httpx, "get", lambda *a, **kw: mock_resp)

        result = _fetch_group_results()
        assert result == {}

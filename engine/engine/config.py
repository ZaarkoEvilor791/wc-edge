import os

from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL", "")
API_FOOTBALL_KEY = os.environ.get("API_FOOTBALL_KEY", "")

FIFA_BASE = "https://play.fifa.com/json/fantasy"
STATSBOMB_BASE = "https://raw.githubusercontent.com/statsbomb/open-data/master/data"
SOFASCORE_BASE = "https://api.sofascore.com/api/v1"
APIF_BASE = "https://v3.football.api-sports.io"

# StatsBomb tournament identifiers (competition_id, season_id)
STATSBOMB_TOURNAMENTS = [
    (43, 106, "sb_wc22"),
    (55, 282, "sb_euro24"),
    (223, 282, "sb_copa24"),
    (1267, 107, "sb_afcon23"),
]

# API-Football league IDs for club stats (league_id, season)
APIF_LEAGUES = [
    (39, 2024),    # EPL
    (140, 2024),   # La Liga
    (78, 2024),    # Bundesliga
    (135, 2024),   # Serie A
    (61, 2024),    # Ligue 1
    (88, 2024),    # Eredivisie
    (94, 2024),    # Primeira Liga
    (179, 2024),   # Scottish Prem
    (144, 2024),   # Jupiler Pro
    (307, 2023),   # Saudi Pro League
    (71, 2024),    # Brasileirão
    (128, 2024),   # Liga Profesional (ARG)
    (262, 2024),   # Liga MX
    (98, 2024),    # J1 League
    (9, 2024),     # Copa America 2024
    (22, 2023),    # CONCACAF Gold Cup 2023
]

# Sofascore AFCON 2025
SOFASCORE_AFCON_TOURNAMENT = 270
SOFASCORE_AFCON_SEASON = 71636

# Scoring constants
GOAL_PTS = {1: 9, 2: 7, 3: 6, 4: 5}    # GK/DEF/MID/FWD (position index 1-4)
CS_PTS = {1: 5, 2: 5, 3: 1, 4: 0}
ASSIST_PTS = 3
APPEARANCE_FULL = 2    # >= 60 min
APPEARANCE_PART = 1    # < 60 min
SAVES_PER_PT = 3       # GK: +1 per 3 saves
YELLOW_CARD = -1
RED_CARD = -2
SCOUTING_BONUS = 2     # >= 4 pts + < 5% ownership

# Scoring events — defined in constants but not yet modelled (no per-player data pre-tournament)
OWN_GOAL         = -2
PENALTY_WON      =  2
PENALTY_CONCEDED = -1
PENALTY_SAVE     =  3   # GK only
FREE_KICK_GOAL   =  1   # additional point for direct FK goal
QUAL_BOOSTER     =  2   # player advances to next round (chip mechanic)

# Stat-based bonuses — Phase 2: add to model once StatsBomb extraction covers these events
TACKLES_PER_PT   =  3   # MID: +1 per 3 tackles
CHANCES_PER_PT   =  2   # MID: +1 per 2 chances created
SHOTS_PER_PT     =  2   # FWD: +1 per 2 shots on target

# Budget / squad rules
BUDGET_GROUP = 100.0
BUDGET_R32 = 105.0
SQUAD_GK = 2
SQUAD_DEF = 5
SQUAD_MID = 5
SQUAD_FWD = 3

# Bayesian priors (xG90, xA90) by position
XG_PRIOR = {1: 0.02, 2: 0.06, 3: 0.12, 4: 0.20}
XA_PRIOR = {1: 0.01, 2: 0.05, 3: 0.10, 4: 0.08}
PRIOR_WEIGHT = 5.0    # equivalent matches of prior


def require_database_url() -> str:
    if not DATABASE_URL:
        raise SystemExit(
            "DATABASE_URL not set. Copy engine/.env.example to engine/.env "
            "and fill in your Render Postgres external URL."
        )
    return DATABASE_URL


def require_apif_key() -> str:
    if not API_FOOTBALL_KEY:
        raise SystemExit(
            "API_FOOTBALL_KEY not set. Add it to engine/.env."
        )
    return API_FOOTBALL_KEY

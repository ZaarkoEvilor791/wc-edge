-- wc-edge database schema
-- Uses 'wc' Postgres schema to avoid collision with fpl-edge tables on shared DB.
-- Safe to re-run: all objects use CREATE IF NOT EXISTS.

CREATE SCHEMA IF NOT EXISTS wc;

CREATE TABLE IF NOT EXISTS wc.players (
    element          INTEGER PRIMARY KEY,
    first_name       TEXT,
    last_name        TEXT,
    known_name       TEXT,
    squad_id         INTEGER,
    position         TEXT,    -- GK/DEF/MID/FWD
    price            REAL,
    status           TEXT,
    percent_selected REAL,
    updated_at       TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wc.teams (
    squad_id    INTEGER PRIMARY KEY,
    name        TEXT,
    abbr        TEXT,
    seed        INTEGER,
    group_name  TEXT
);

CREATE TABLE IF NOT EXISTS wc.rounds (
    id          INTEGER PRIMARY KEY,
    stage       TEXT,
    start_date  TIMESTAMP,
    end_date    TIMESTAMP,
    status      TEXT,
    updated_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wc.player_stats (
    element          INTEGER PRIMARY KEY,
    api_football_id  INTEGER,

    -- Club stats (API-Football, current season)
    club_goals90     REAL,
    club_assists90   REAL,
    club_minutes     INTEGER,
    club_start_rate  REAL,
    club_saves90     REAL,

    -- Best tournament (StatsBomb preferred → API-Football → Sofascore)
    tourn_source     TEXT,    -- 'sb_wc22'|'sb_euro24'|'sb_copa24'|'sb_afcon23'|'apif'|'sofa'
    tourn_xg90       REAL,
    tourn_xa90       REAL,
    tourn_minutes    INTEGER,
    tourn_age_years  REAL,    -- years since tournament end (decay input)
    tourn_saves90    REAL,

    scraped_at       TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wc.projections (
    element              INTEGER,
    round                INTEGER,

    mf                   REAL,
    p_play               REAL,
    xg90_posterior       REAL,
    xa90_posterior       REAL,
    lambda_posterior     REAL,
    pcs                  REAL,
    defensive_multiplier REAL,

    xp                   REAL,
    variance             REAL,
    p_goal               REAL,
    p_cs                 REAL,
    low_sample           BOOLEAN DEFAULT FALSE,

    updated_at           TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (element, round)
);

CREATE TABLE IF NOT EXISTS wc.team_fdr (
    squad_id          INTEGER,
    round             INTEGER,
    lambda_posterior  REAL,
    def_multiplier    REAL,
    xg_created_pg     REAL,
    xgc_pg            REAL,
    goals_pg          REAL,
    goals_conceded_pg REAL,
    updated_at        TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (squad_id, round)
);

CREATE TABLE IF NOT EXISTS wc.suggested_squad (
    id           SERIAL PRIMARY KEY,
    round        INTEGER NOT NULL,
    squad_json   JSONB NOT NULL,
    total_xp     REAL,
    total_cost   REAL,
    computed_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wc_suggested_squad_round_idx ON wc.suggested_squad (round)

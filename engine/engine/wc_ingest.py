"""Phase 1 scraper: StatsBomb + Sofascore + FIFA Fantasy + API-Football -> wc.player_stats."""

import argparse
import asyncio
import json
import pathlib
import re
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

import httpx
import psycopg
from rapidfuzz import fuzz
from rapidfuzz import process as fuzz_process

from .config import (
    APIF_BASE,
    APIF_LEAGUES,
    FIFA_BASE,
    SOFASCORE_AFCON_SEASON,
    SOFASCORE_AFCON_TOURNAMENT,
    SOFASCORE_BASE,
    STATSBOMB_BASE,
    STATSBOMB_TOURNAMENTS,
    require_apif_key,
)
from .db import connect, init_schema

DATA_DIR = pathlib.Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

SB_CACHE = DATA_DIR / "sb_cache.json"
SOFA_CACHE = DATA_DIR / "sofa_cache.json"
UNMATCHED = DATA_DIR / "unmatched_players.json"
APIF_BUDGET = DATA_DIR / "apif_budget.json"
NAME_OVERRIDES = DATA_DIR / "name_overrides.json"


# ---------------------------------------------------------------------------
# Name utilities
# ---------------------------------------------------------------------------

def normalize(name: str) -> str:
    """Strip diacritics, lowercase, remove punctuation, collapse whitespace."""
    name = unicodedata.normalize("NFKD", name)
    name = "".join(c for c in name if not unicodedata.combining(c))
    name = name.lower()
    name = re.sub(r"[^a-z0-9 ]", " ", name)
    return re.sub(r"\s+", " ", name).strip()


def _load_overrides() -> dict[str, str]:
    if NAME_OVERRIDES.exists():
        return json.loads(NAME_OVERRIDES.read_text(encoding="utf-8"))
    return {}


def _fuzzy_match(query: str, choices: list[str], overrides: dict[str, str]) -> str | None:
    """Return the best matching key from choices, or None below threshold."""
    if query in overrides:
        target = normalize(overrides[query])
        if target in choices:
            return target
    if not choices:
        return None
    result = fuzz_process.extractOne(
        query, choices, scorer=fuzz.token_set_ratio, score_cutoff=85
    )
    return result[0] if result else None


def _years_since(date_str: str) -> float:
    try:
        end = datetime.fromisoformat(date_str).replace(tzinfo=timezone.utc)
    except ValueError:
        return 2.0
    return (datetime.now(timezone.utc) - end).days / 365.25


# ---------------------------------------------------------------------------
# StatsBomb
# ---------------------------------------------------------------------------

def _sb_player_names(events: list[dict]) -> dict[int, str]:
    """Build {player_id: player_name} from Starting XI and Substitution events."""
    names: dict[int, str] = {}
    for e in events:
        etype = e["type"]["name"]
        if etype == "Starting XI":
            for entry in e.get("tactics", {}).get("lineup", []):
                pid = entry["player"]["id"]
                names[pid] = entry["player"]["name"]
        elif etype == "Substitution":
            if "player" in e:
                names[e["player"]["id"]] = e["player"]["name"]
            rep = e.get("substitution", {}).get("replacement", {})
            if rep.get("id"):
                names[rep["id"]] = rep["name"]
    return names


def _sb_minutes(events: list[dict]) -> dict[int, int]:
    """Compute minutes played per player for one match, capped at 90."""
    minutes: dict[int, int] = {}
    for e in events:
        if e["type"]["name"] == "Starting XI":
            for entry in e.get("tactics", {}).get("lineup", []):
                minutes[entry["player"]["id"]] = 90
    for e in events:
        if e["type"]["name"] != "Substitution":
            continue
        off_id = e["player"]["id"]
        rep = e.get("substitution", {}).get("replacement", {})
        on_id = rep.get("id")
        sub_min = min(e.get("minute", 90), 90)
        minutes[off_id] = sub_min
        if on_id:
            minutes[on_id] = minutes.get(on_id, 0) + (90 - sub_min)
    return minutes


def _process_sb_match(events: list[dict]) -> dict[str, dict]:
    """Extract {normalized_name: {xg, xa, minutes, saves, chances, tackles, sot, name}} from one match."""
    # Shot map: {event_id: xg} — non-penalty, non-own-goal shots only
    shot_map: dict[str, float] = {
        e["id"]: (e.get("shot") or {}).get("statsbomb_xg") or 0.0
        for e in events
        if e["type"]["name"] == "Shot"
        and (e.get("shot") or {}).get("type", {}).get("name") != "Penalty"
        and (e.get("shot") or {}).get("outcome", {}).get("name") != "Own Goal"
    }

    player_names = _sb_player_names(events)
    minutes_map = _sb_minutes(events)

    # Accumulate per player_id
    stats: dict[int, dict[str, Any]] = {}

    def _entry(pid: int) -> dict:
        if pid not in stats:
            stats[pid] = {"xg": 0.0, "xa": 0.0, "minutes": 0, "saves": 0,
                          "chances": 0, "tackles": 0, "sot": 0}
        return stats[pid]

    for e in events:
        etype = e["type"]["name"]
        pid = (e.get("player") or {}).get("id")
        if not pid:
            continue

        if etype == "Shot" and e["id"] in shot_map:
            _entry(pid)["xg"] += shot_map[e["id"]]
            outcome = (e.get("shot") or {}).get("outcome", {}).get("name", "")
            if outcome in ("Goal", "Saved", "Saved Off Post", "Saved to Post"):
                _entry(pid)["sot"] += 1

        elif etype == "Pass":
            pass_data = e.get("pass") or {}
            if pass_data.get("shot_assist"):
                _entry(pid)["chances"] += 1  # pass directly creating a shot = chance created
                aided_id = pass_data.get("assisted_shot_id")
                if aided_id and aided_id in shot_map:
                    _entry(pid)["xa"] += shot_map[aided_id]

        elif etype == "Duel":
            duel_data = e.get("duel") or {}
            if duel_data.get("type", {}).get("name") == "Tackle":
                _entry(pid)["tackles"] += 1

        elif etype == "Goal Keeper":
            outcome = (e.get("goalkeeper") or {}).get("outcome", {}).get("name", "")
            if "Saved" in outcome:
                _entry(pid)["saves"] += 1

    # Merge minutes; include all players on the pitch even with zero tracked events
    for pid, mins in minutes_map.items():
        _entry(pid)["minutes"] += mins

    # Key result by normalized name
    result: dict[str, dict] = {}
    for pid, s in stats.items():
        pname = player_names.get(pid, "")
        if not pname:
            continue
        key = normalize(pname)
        if key in result:
            result[key]["xg"] += s["xg"]
            result[key]["xa"] += s["xa"]
            result[key]["minutes"] += s["minutes"]
            result[key]["saves"] += s["saves"]
        else:
            result[key] = {**s, "name": pname}
    return result


async def run_statsbomb(dry_run: bool = False) -> None:
    cache: dict[str, dict] = {}

    async with httpx.AsyncClient(timeout=30) as client:
        for comp_id, season_id, tag in STATSBOMB_TOURNAMENTS:
            url = f"{STATSBOMB_BASE}/matches/{comp_id}/{season_id}.json"
            print(f"[statsbomb] {tag}: fetching match list …")
            resp = await client.get(url)
            resp.raise_for_status()
            matches = resp.json()

            # Tournament end date for age decay
            dates = [m.get("match_date", "") for m in matches if m.get("match_date")]
            tourn_end = max(dates) if dates else "2024-01-01"
            age_years = _years_since(tourn_end)

            tourn: dict[str, dict] = defaultdict(
                lambda: {"xg": 0.0, "xa": 0.0, "minutes": 0, "saves": 0,
                         "chances": 0, "tackles": 0, "sot": 0, "name": ""}
            )

            for i, match in enumerate(matches):
                match_id = match["match_id"]
                try:
                    er = await client.get(f"{STATSBOMB_BASE}/events/{match_id}.json")
                    er.raise_for_status()
                    match_stats = _process_sb_match(er.json())
                except Exception as exc:
                    print(f"[statsbomb] WARN match {match_id}: {exc}")
                    await asyncio.sleep(0.5)
                    continue

                for key, s in match_stats.items():
                    tourn[key]["xg"] += s["xg"]
                    tourn[key]["xa"] += s["xa"]
                    tourn[key]["minutes"] += s["minutes"]
                    tourn[key]["saves"] += s["saves"]
                    tourn[key]["chances"] += s["chances"]
                    tourn[key]["tackles"] += s["tackles"]
                    tourn[key]["sot"] += s["sot"]
                    tourn[key]["name"] = s["name"]

                if (i + 1) % 20 == 0:
                    print(f"[statsbomb] {tag}: {i + 1}/{len(matches)} done")
                await asyncio.sleep(0.5)

            # Merge into global cache keeping best tournament by minutes
            added = 0
            for key, s in tourn.items():
                if s["minutes"] < 45:
                    continue
                if key not in cache or s["minutes"] > cache[key]["minutes"]:
                    cache[key] = {
                        "source": tag,
                        "xg": s["xg"],
                        "xa": s["xa"],
                        "minutes": s["minutes"],
                        "saves": s["saves"],
                        "chances": s["chances"],
                        "tackles": s["tackles"],
                        "sot": s["sot"],
                        "tourn_end": tourn_end,
                        "age_years": age_years,
                        "name": s["name"],
                    }
                    added += 1
            print(f"[statsbomb] {tag}: {len(matches)} matches, {added} players >=45 min")

    print(f"[statsbomb] Total: {len(cache)} unique players across all tournaments")
    if not dry_run:
        SB_CACHE.write_text(json.dumps(cache, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"[statsbomb] Cache written -> {SB_CACHE}")


# ---------------------------------------------------------------------------
# Sofascore (AFCON 2025 patch)
# ---------------------------------------------------------------------------

_SOFA_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "Referer": "https://www.sofascore.com/",
}


async def run_sofascore(dry_run: bool = False) -> None:
    cache: dict[str, dict] = {}
    tourn_end = "2025-02-09"
    age_years = _years_since(tourn_end)

    url = (
        f"{SOFASCORE_BASE}/unique-tournament/{SOFASCORE_AFCON_TOURNAMENT}"
        f"/season/{SOFASCORE_AFCON_SEASON}/statistics"
        f"?limit=100&offset=0&accumulation=total"
        f"&fields=goals%2CminutesPlayed%2Cassists&order=-goals"
    )

    async with httpx.AsyncClient(headers=_SOFA_HEADERS, timeout=20, follow_redirects=True) as client:
        try:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            print(f"[sofascore] WARN: {exc} — AFCON 2025 patch skipped")
            return

    results = data.get("results", data.get("data", []))
    print(f"[sofascore] {len(results)} AFCON rows")

    for row in results:
        player = row.get("player", {})
        pname = player.get("name", "")
        if not pname:
            continue
        minutes = row.get("minutesPlayed", 0) or 0
        if minutes < 45:
            continue
        key = normalize(pname)
        cache[key] = {
            "source": "sofa",
            "goals": row.get("goals", 0) or 0,
            "assists": row.get("assists", 0) or 0,
            "minutes": minutes,
            "tourn_end": tourn_end,
            "age_years": age_years,
            "name": pname,
        }

    print(f"[sofascore] {len(cache)} AFCON players with >=45 min")
    if not dry_run:
        SOFA_CACHE.write_text(json.dumps(cache, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"[sofascore] Cache written -> {SOFA_CACHE}")


# ---------------------------------------------------------------------------
# FIFA Fantasy
# ---------------------------------------------------------------------------

_POS_MAP = {1: "GK", 2: "DEF", 3: "MID", 4: "FWD"}
_VALID_POS = {"GK", "DEF", "MID", "FWD"}

def _parse_pos(raw) -> str:
    if isinstance(raw, str) and raw.upper() in _VALID_POS:
        return raw.upper()
    return _POS_MAP.get(raw, "MID")


def run_fifa(conn: psycopg.Connection, dry_run: bool = False) -> None:
    with httpx.Client(timeout=20) as client:
        players = client.get(f"{FIFA_BASE}/players.json").raise_for_status().json()
        rounds = client.get(f"{FIFA_BASE}/rounds.json").raise_for_status().json()
        squads = client.get(f"{FIFA_BASE}/squads_fifa.json").raise_for_status().json()

    if len(players) < 100:
        print(
            f"[fifa] WARNING: only {len(players)} players — API may not be live yet. "
            "Skipping DB writes."
        )
        return

    # Build team map from rounds fixtures (sequential IDs matching player.squadId)
    teams_map: dict[int, dict] = {}
    for rnd in rounds:
        for fix in rnd.get("tournaments", []):
            for sid_key, name_key, abbr_key in [
                ("homeSquadId", "homeSquadName", "homeSquadAbbr"),
                ("awaySquadId", "awaySquadName", "awaySquadAbbr"),
            ]:
                sid = fix.get(sid_key)
                if sid and sid not in teams_map:
                    teams_map[sid] = {
                        "id": sid,
                        "name": fix.get(name_key),
                        "abbr": fix.get(abbr_key),
                        "seed": None,
                        "group": None,
                    }

    # Enrich with seed/group from squads_fifa by name match
    for sq in squads:
        sq_norm = normalize(sq.get("name", ""))
        for team in teams_map.values():
            if normalize(team["name"] or "") == sq_norm:
                team["seed"] = sq.get("seed")
                raw_group = sq.get("group")
                team["group"] = raw_group.upper() if raw_group else None
                break

    print(f"[fifa] {len(players)} players | {len(rounds)} rounds | {len(teams_map)} teams (from fixtures)")

    if dry_run:
        return

    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO wc.teams (squad_id, name, abbr, seed, group_name)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (squad_id) DO UPDATE SET
                name = EXCLUDED.name, abbr = EXCLUDED.abbr,
                seed = EXCLUDED.seed, group_name = EXCLUDED.group_name
            """,
            [(t["id"], t["name"], t["abbr"], t["seed"], t["group"]) for t in teams_map.values()],
        )
        cur.executemany(
            """
            INSERT INTO wc.rounds (id, stage, start_date, end_date, status, updated_at)
            VALUES (%s, %s, %s, %s, %s, NOW())
            ON CONFLICT (id) DO UPDATE SET
                stage = EXCLUDED.stage, start_date = EXCLUDED.start_date,
                end_date = EXCLUDED.end_date, status = EXCLUDED.status,
                updated_at = NOW()
            """,
            [(r["id"], r.get("stage"), r.get("startDate"), r.get("endDate"), r.get("status"))
             for r in rounds],
        )
        cur.executemany(
            """
            INSERT INTO wc.players
                (element, first_name, last_name, known_name, squad_id,
                 position, price, status, percent_selected, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
            ON CONFLICT (element) DO UPDATE SET
                first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
                known_name = EXCLUDED.known_name, squad_id = EXCLUDED.squad_id,
                position = EXCLUDED.position, price = EXCLUDED.price,
                status = EXCLUDED.status, percent_selected = EXCLUDED.percent_selected,
                updated_at = NOW()
            """,
            [
                (
                    p["id"], p.get("firstName"), p.get("lastName"), p.get("knownName"),
                    p.get("squadId"), _parse_pos(p.get("position")),
                    p.get("price"), p.get("status"), p.get("percentSelected"),
                )
                for p in players
            ],
        )
    conn.commit()
    print(f"[fifa] Upserted players/teams/rounds")

    # --- Fuzzy-match StatsBomb + Sofascore caches into player_stats ---
    sb_cache: dict[str, dict] = (
        json.loads(SB_CACHE.read_text(encoding="utf-8")) if SB_CACHE.exists() else {}
    )
    sofa_cache: dict[str, dict] = (
        json.loads(SOFA_CACHE.read_text(encoding="utf-8")) if SOFA_CACHE.exists() else {}
    )

    if not sb_cache and not sofa_cache:
        print("[fifa] No StatsBomb/Sofascore cache — run --source statsbomb first")
        return

    overrides = _load_overrides()
    sb_keys = list(sb_cache.keys())
    sofa_keys = list(sofa_cache.keys())

    stats_rows: list[tuple] = []
    unmatched: list[dict] = []

    for p in players:
        display = (p.get("knownName") or
                   f"{p.get('firstName', '')} {p.get('lastName', '')}".strip())
        norm = normalize(display)

        sb_key = _fuzzy_match(norm, sb_keys, overrides)
        if sb_key:
            s = sb_cache[sb_key]
            mins = s["minutes"]
            xg90      = s["xg"]     / mins * 90 if mins >= 45 else None
            xa90      = s["xa"]     / mins * 90 if mins >= 45 else None
            sv90      = s["saves"]  / mins * 90 if mins >= 45 else None
            chances90 = s.get("chances", 0) / mins * 90 if mins >= 45 else None
            tackles90 = s.get("tackles", 0) / mins * 90 if mins >= 45 else None
            sot90     = s.get("sot",     0) / mins * 90 if mins >= 45 else None
            stats_rows.append((p["id"], s["source"], xg90, xa90, mins, s["age_years"], sv90,
                               chances90, tackles90, sot90))
            continue

        sofa_key = _fuzzy_match(norm, sofa_keys, overrides)
        if sofa_key:
            s = sofa_cache[sofa_key]
            mins = s["minutes"]
            g90 = s["goals"] / mins * 90 if mins >= 45 else None
            a90 = s["assists"] / mins * 90 if mins >= 45 else None
            stats_rows.append((p["id"], "sofa", g90, a90, mins, s["age_years"], None,
                               None, None, None))
            continue

        unmatched.append({"element": p["id"], "name": display, "normalized": norm,
                          "price": p.get("price", 0)})

    if stats_rows:
        with conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO wc.player_stats
                    (element, tourn_source, tourn_xg90, tourn_xa90,
                     tourn_minutes, tourn_age_years, tourn_saves90,
                     tourn_chances90, tourn_tackles90, tourn_sot90, scraped_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (element) DO UPDATE SET
                    tourn_source = EXCLUDED.tourn_source,
                    tourn_xg90 = EXCLUDED.tourn_xg90,
                    tourn_xa90 = EXCLUDED.tourn_xa90,
                    tourn_minutes = EXCLUDED.tourn_minutes,
                    tourn_age_years = EXCLUDED.tourn_age_years,
                    tourn_saves90 = EXCLUDED.tourn_saves90,
                    tourn_chances90 = EXCLUDED.tourn_chances90,
                    tourn_tackles90 = EXCLUDED.tourn_tackles90,
                    tourn_sot90 = EXCLUDED.tourn_sot90,
                    scraped_at = NOW()
                """,
                stats_rows,
            )
        conn.commit()

    print(f"[fifa] Matched {len(stats_rows)}/{len(players)} players to tournament stats")
    unmatched.sort(key=lambda x: x["price"] or 0, reverse=True)
    UNMATCHED.write_text(json.dumps(unmatched, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[fifa] {len(unmatched)} unmatched -> {UNMATCHED}")


# ---------------------------------------------------------------------------
# API-Football
# ---------------------------------------------------------------------------

def _load_budget() -> dict[str, int]:
    if APIF_BUDGET.exists():
        return json.loads(APIF_BUDGET.read_text())
    return {"day1_used": 0, "day2_used": 0}


def _save_budget(budget: dict) -> None:
    APIF_BUDGET.write_text(json.dumps(budget, indent=2))


async def _apif_get(
    client: httpx.AsyncClient,
    path: str,
    key: str,
    budget: dict,
    day_key: str,
) -> dict | None:
    if budget.get(day_key, 0) >= 100:
        print(f"[apif] Day budget exhausted ({budget[day_key]} req)")
        return None
    try:
        resp = await client.get(path, headers={"x-apisports-key": key})
    except Exception as exc:
        print(f"[apif] WARN request failed: {exc}")
        return None
    budget[day_key] = budget.get(day_key, 0) + 1
    _save_budget(budget)
    if resp.status_code == 429:
        print("[apif] 429 — sleeping 65s")
        await asyncio.sleep(65)
        return None
    if resp.status_code != 200:
        print(f"[apif] HTTP {resp.status_code} for {path}")
        return None
    data = resp.json()
    if data.get("errors"):
        print(f"[apif] API error for {path}: {data['errors']}")
        return None
    return data


# Big 5 leagues worth paginating past page 1
_BIG5 = {39, 140, 78, 135, 61}


async def run_apif(conn: psycopg.Connection, day: int, dry_run: bool = False) -> None:
    key = require_apif_key()
    budget = _load_budget()
    day_key = f"day{day}_used"
    if day_key not in budget:
        budget[day_key] = 0

    # FIFA player name → element map for matching
    with conn.cursor() as cur:
        cur.execute(
            "SELECT element, known_name, first_name, last_name FROM wc.players"
        )
        rows = cur.fetchall()

    fifa_norm: dict[str, int] = {}
    # last_name_map: normalized last name -> element (only if unique)
    last_name_count: dict[str, int] = {}
    last_name_map: dict[str, int] = {}
    for element, known, first, last in rows:
        display = known or f"{first or ''} {last or ''}".strip()
        fifa_norm[normalize(display)] = element
        if last:
            lnorm = normalize(last)
            last_name_count[lnorm] = last_name_count.get(lnorm, 0) + 1
    for element, known, first, last in rows:
        if last:
            lnorm = normalize(last)
            if last_name_count.get(lnorm, 0) == 1:
                last_name_map[lnorm] = element

    overrides = _load_overrides()
    fifa_keys = list(fifa_norm.keys())

    _ABBREV_RE = re.compile(r"^[a-z]\.?\s+(.+)$")

    def _resolve_element(pname: str) -> int | None:
        norm = normalize(pname)
        # 1. Exact
        if norm in fifa_norm:
            return fifa_norm[norm]
        # 2. Fuzzy (threshold 85)
        matched = _fuzzy_match(norm, fifa_keys, overrides)
        if matched:
            return fifa_norm[matched]
        # 3. Abbreviated first name: "A. Isak" -> last name lookup
        m = _ABBREV_RE.match(norm)
        if m:
            last_part = m.group(1).strip()
            # Try last word as surname
            last_word = last_part.split()[-1]
            if last_word in last_name_map:
                return last_name_map[last_word]
        return None

    # Accumulate: element -> best (most-minutes) club stats
    club: dict[int, dict] = {}

    async with httpx.AsyncClient(timeout=20, base_url=APIF_BASE) as client:
        for league_id, season in APIF_LEAGUES:
            if budget.get(day_key, 0) >= 95:
                print(f"[apif] Approaching limit at league {league_id}, stopping")
                break

            # topscorers endpoint has no pagination
            data = await _apif_get(
                client,
                f"/players/topscorers?league={league_id}&season={season}",
                key, budget, day_key,
            )
            if not data:
                pass
            else:
                for entry in data.get("response", []):
                    pname = (entry.get("player") or {}).get("name", "")
                    apif_id = (entry.get("player") or {}).get("id")
                    stats = (entry.get("statistics") or [{}])[0]
                    games = stats.get("games") or {}
                    goals = stats.get("goals") or {}

                    minutes = games.get("minutes") or 0
                    lineups = games.get("lineups") or 0

                    element = _resolve_element(pname)
                    if element is None:
                        continue

                    existing = club.get(element)
                    if existing is None or minutes > existing["minutes"]:
                        club[element] = {
                            "apif_id": apif_id,
                            "goals": goals.get("total") or 0,
                            "assists": goals.get("assists") or 0,
                            "minutes": minutes,
                            "lineups": lineups,
                        }

            print(
                f"[apif] league={league_id} season={season} "
                f"budget={budget.get(day_key, 0)}"
            )
            await asyncio.sleep(6)

    print(f"[apif] {len(club)} players with club stats | {budget.get(day_key, 0)} req used")

    if dry_run:
        return

    with conn.cursor() as cur:
        for element, s in club.items():
            mins = s["minutes"]
            goals90 = s["goals"] / mins * 90 if mins >= 90 else None
            assists90 = s["assists"] / mins * 90 if mins >= 90 else None
            start_rate = min(1.0, s["lineups"] / 38) if s["lineups"] > 0 else None
            cur.execute(
                """
                INSERT INTO wc.player_stats
                    (element, api_football_id, club_goals90, club_assists90,
                     club_minutes, club_start_rate, scraped_at)
                VALUES (%s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (element) DO UPDATE SET
                    api_football_id = EXCLUDED.api_football_id,
                    club_goals90 = EXCLUDED.club_goals90,
                    club_assists90 = EXCLUDED.club_assists90,
                    club_minutes = EXCLUDED.club_minutes,
                    club_start_rate = EXCLUDED.club_start_rate,
                    scraped_at = NOW()
                """,
                (element, s["apif_id"], goals90, assists90, mins, start_rate),
            )
    conn.commit()
    print(f"[apif] Club stats written for {len(club)} players")


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

def run_report() -> None:
    if not UNMATCHED.exists():
        print("No unmatched_players.json found. Run --source fifa first.")
        return
    unmatched = json.loads(UNMATCHED.read_text(encoding="utf-8"))
    print(f"\nUnmatched players — {len(unmatched)} total (sorted by price):\n")
    for p in unmatched[:50]:
        print(f"  £{p.get('price') or 0:5.1f}m  {p['name']:<30}  key: {p['normalized']}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="wc-edge Phase 1 scraper")
    parser.add_argument("--source", choices=["statsbomb", "sofascore", "fifa", "apif"])
    parser.add_argument("--day", type=int, default=1, help="API-Football day budget slot (1 or 2)")
    parser.add_argument("--dry-run", action="store_true", help="Skip all DB and file writes")
    parser.add_argument("--report", action="store_true", help="Print unmatched players")
    args = parser.parse_args()

    if args.report:
        run_report()
        return

    if args.source == "statsbomb":
        asyncio.run(run_statsbomb(dry_run=args.dry_run))

    elif args.source == "sofascore":
        asyncio.run(run_sofascore(dry_run=args.dry_run))

    elif args.source == "fifa":
        conn = connect()
        init_schema(conn)
        run_fifa(conn, dry_run=args.dry_run)
        conn.close()

    elif args.source == "apif":
        conn = connect()
        asyncio.run(run_apif(conn, day=args.day, dry_run=args.dry_run))
        conn.close()

    else:
        parser.print_help()


if __name__ == "__main__":
    main()

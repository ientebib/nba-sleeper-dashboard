#!/usr/bin/env python3
"""
SLEEPR Fantasy Basketball Data Refresh Script
Fetches latest data from Sleeper API and NBA Stats API, then updates the dashboard.

Usage:
    python3 refresh_data.py              # Full refresh (rosters + all game logs)
    python3 refresh_data.py --quick      # Quick refresh (rosters only, no game logs)
    python3 refresh_data.py --free-agents # Include top 100 free agents

Requirements:
    pip install requests pandas nba_api
"""

import json
import requests
import pandas as pd
from datetime import datetime, timedelta
from pathlib import Path
import time
import sys
import argparse

# Configuration
LEAGUE_ID = "1284738635970666496"  # Your Sleeper league ID (NBA LOCK IN 15K FINAL)
SEASON = "2025-26"  # NBA season
SEASON_START = datetime(2025, 10, 21)  # 2025-26 season start date (October 21, 2025)
DATA_DIR = Path(__file__).parent.parent / "data"
DASHBOARD_PUBLIC = Path(__file__).parent.parent / "dashboard" / "public"

# Sleeper API endpoints
SLEEPER_BASE = "https://api.sleeper.app/v1"

# Cache for NBA player lookups
_nba_players_cache = None


def log(message: str):
    """Print timestamped log message."""
    timestamp = datetime.now().strftime("%H:%M:%S")
    print(f"[{timestamp}] {message}")


def fetch_nba_schedule() -> dict:
    """Fetch NBA schedule from CDN endpoint."""
    log("Fetching NBA schedule...")
    url = "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json"
    headers = {"User-Agent": "Mozilla/5.0"}
    response = requests.get(url, headers=headers, timeout=30)
    response.raise_for_status()
    data = response.json()

    # Process into a more usable format
    schedule = data.get("leagueSchedule", {})
    game_dates = schedule.get("gameDates", [])

    # Build team schedule: {team_code: [{date, opponent, home}]}
    team_schedules = {}
    today = datetime.now()

    for gd in game_dates:
        date_str = gd.get("gameDate", "")
        try:
            game_date = datetime.strptime(date_str, "%m/%d/%Y %H:%M:%S")
        except ValueError:
            continue

        for game in gd.get("games", []):
            home_team = game.get("homeTeam", {}).get("teamTricode", "")
            away_team = game.get("awayTeam", {}).get("teamTricode", "")
            game_time = game.get("gameTimeEst", "")

            if not home_team or not away_team:
                continue

            # Add to home team schedule
            if home_team not in team_schedules:
                team_schedules[home_team] = []
            team_schedules[home_team].append({
                "date": game_date.strftime("%Y-%m-%d"),
                "opponent": away_team,
                "home": True,
                "time": game_time,
            })

            # Add to away team schedule
            if away_team not in team_schedules:
                team_schedules[away_team] = []
            team_schedules[away_team].append({
                "date": game_date.strftime("%Y-%m-%d"),
                "opponent": home_team,
                "home": False,
                "time": game_time,
            })

    # Calculate remaining games this week for each team
    # Week ends on Sunday
    today_weekday = today.weekday()  # Monday=0, Sunday=6
    days_until_sunday = (6 - today_weekday) % 7 + 1 if today_weekday != 6 else 7
    week_end = today + timedelta(days=days_until_sunday)

    remaining_this_week = {}
    for team, games in team_schedules.items():
        remaining = [g for g in games if today.strftime("%Y-%m-%d") <= g["date"] <= week_end.strftime("%Y-%m-%d")]
        remaining_this_week[team] = remaining

    return {
        "season": schedule.get("seasonYear", ""),
        "lastUpdated": today.isoformat(),
        "weekEnd": week_end.strftime("%Y-%m-%d"),
        "teamSchedules": team_schedules,
        "remainingThisWeek": remaining_this_week,
    }


def fetch_sleeper_rosters() -> list:
    """Fetch current rosters from Sleeper API."""
    log("Fetching rosters from Sleeper API...")
    url = f"{SLEEPER_BASE}/league/{LEAGUE_ID}/rosters"
    response = requests.get(url)
    response.raise_for_status()
    return response.json()


def fetch_sleeper_users() -> dict:
    """Fetch league users from Sleeper API."""
    log("Fetching users from Sleeper API...")
    url = f"{SLEEPER_BASE}/league/{LEAGUE_ID}/users"
    response = requests.get(url)
    response.raise_for_status()
    users = response.json()
    return {u["user_id"]: u for u in users}


def fetch_sleeper_league() -> dict:
    """Fetch league info from Sleeper API."""
    log("Fetching league info from Sleeper API...")
    url = f"{SLEEPER_BASE}/league/{LEAGUE_ID}"
    response = requests.get(url)
    response.raise_for_status()
    return response.json()


def fetch_sleeper_all_players() -> dict:
    """Fetch ALL NBA players from Sleeper API."""
    log("Fetching all NBA players from Sleeper API...")
    url = f"{SLEEPER_BASE}/players/nba"
    response = requests.get(url)
    response.raise_for_status()
    return response.json()


def get_nba_players_list():
    """Get list of all NBA players from nba_api (cached)."""
    global _nba_players_cache
    if _nba_players_cache is None:
        from nba_api.stats.static import players
        _nba_players_cache = players.get_players()
    return _nba_players_cache


def find_nba_player_id(player_name: str, team: str = None) -> int:
    """Find NBA player ID by name using nba_api."""
    nba_players = get_nba_players_list()

    # Normalize name for comparison
    name_lower = player_name.lower().strip()

    # Try exact match first
    for p in nba_players:
        if p['full_name'].lower() == name_lower:
            return p['id']

    # Try without Jr/Sr/III suffixes
    name_clean = name_lower.replace(' jr.', '').replace(' jr', '').replace(' sr.', '').replace(' sr', '')
    name_clean = name_clean.replace(' iii', '').replace(' ii', '').replace(' iv', '').strip()

    for p in nba_players:
        p_clean = p['full_name'].lower().replace(' jr.', '').replace(' jr', '').replace(' sr.', '').replace(' sr', '')
        p_clean = p_clean.replace(' iii', '').replace(' ii', '').replace(' iv', '').strip()
        if p_clean == name_clean:
            return p['id']

    # Try last name + first initial match
    parts = name_lower.split()
    if len(parts) >= 2:
        last_name = parts[-1]
        first_initial = parts[0][0]
        for p in nba_players:
            p_parts = p['full_name'].lower().split()
            if len(p_parts) >= 2:
                if p_parts[-1] == last_name and p_parts[0][0] == first_initial:
                    if p.get('is_active', True):  # Prefer active players
                        return p['id']

    return None


def fetch_player_gamelog(player_id: int, player_name: str = "") -> list:
    """Fetch game log for a player from NBA Stats API."""
    try:
        from nba_api.stats.endpoints import playergamelog
        gamelog = playergamelog.PlayerGameLog(
            player_id=player_id,
            season=SEASON,
            season_type_all_star="Regular Season"
        )
        time.sleep(0.6)  # Rate limit to avoid getting blocked
        return gamelog.get_normalized_dict()["PlayerGameLog"]
    except Exception as e:
        log(f"  Warning: Could not fetch gamelog for {player_name} ({player_id}): {e}")
        return []


def get_week_number(date_str: str) -> int:
    """Calculate fantasy week number based on date."""
    try:
        date = datetime.strptime(date_str, "%b %d, %Y")
    except ValueError:
        # Try alternate format
        date = datetime.strptime(date_str, "%Y-%m-%d")

    # Find the Monday of the season start week
    start_monday = SEASON_START - timedelta(days=SEASON_START.weekday())
    days_diff = (date - start_monday).days
    return max(1, (days_diff // 7) + 1)


def calculate_fpts(game: dict, scoring: dict) -> float:
    """Calculate fantasy points based on scoring settings."""
    fpts = 0.0

    # Map Sleeper scoring keys to NBA API stat keys
    stat_map = {
        "pts": "PTS",
        "reb": "REB",
        "ast": "AST",
        "stl": "STL",
        "blk": "BLK",
        "to": "TOV",      # Sleeper uses "to", NBA uses "TOV"
        "fgm": "FGM",
        "fga": "FGA",
        "ftm": "FTM",
        "fta": "FTA",
        "tpm": "FG3M"     # Sleeper uses "tpm" for 3PM
    }

    for sleeper_key, nba_key in stat_map.items():
        if sleeper_key in scoring and nba_key in game:
            fpts += scoring[sleeper_key] * (game[nba_key] or 0)

    # Get raw stats for bonus calculations
    pts = game.get("PTS", 0) or 0
    reb = game.get("REB", 0) or 0
    ast = game.get("AST", 0) or 0
    stl = game.get("STL", 0) or 0
    blk = game.get("BLK", 0) or 0

    # Bonus scoring
    # Points bonuses
    if pts >= 50 and "bonus_pt_50p" in scoring:
        fpts += scoring["bonus_pt_50p"]
    if pts >= 40 and "bonus_pt_40p" in scoring:
        fpts += scoring["bonus_pt_40p"]

    # Rebounds bonus
    if reb >= 20 and "bonus_reb_20p" in scoring:
        fpts += scoring["bonus_reb_20p"]

    # Assists bonus
    if ast >= 15 and "bonus_ast_15p" in scoring:
        fpts += scoring["bonus_ast_15p"]

    # Double-double bonus (2 categories with 10+)
    categories_10plus = sum([1 for val in [pts, reb, ast, stl, blk] if val >= 10])
    if categories_10plus >= 2 and "dd" in scoring:
        fpts += scoring["dd"]

    # Triple-double bonus (3 categories with 10+)
    if categories_10plus >= 3 and "td" in scoring:
        fpts += scoring["td"]

    return round(fpts, 1)


def process_rosters(users: dict, rosters: list, nba_players: dict) -> tuple:
    """Process roster data and build player mappings."""
    roster_data = []
    player_to_team = {}  # sleeper_id -> team info
    all_rostered_ids = set()

    for roster in rosters:
        user_id = roster.get("owner_id")
        user = users.get(user_id, {})
        team_name = user.get("metadata", {}).get("team_name", user.get("display_name", f"Team {roster['roster_id']}"))
        owner_name = user.get("display_name", f"Owner {roster['roster_id']}")

        # Get win/loss record
        settings = roster.get("settings", {})
        wins = settings.get("wins", 0)
        losses = settings.get("losses", 0)
        record = f"{wins}-{losses}"

        # Build player list with details
        players_list = []
        for player_id in roster.get("players", []):
            all_rostered_ids.add(player_id)
            player_info = nba_players.get(player_id, {})
            players_list.append({
                "sleeper_id": player_id,
                "name": f"{player_info.get('first_name', '')} {player_info.get('last_name', '')}".strip() or f"Player {player_id}",
                "team": player_info.get("team", ""),
                "position": player_info.get("position", ""),
                "injury_status": player_info.get("injury_status"),
            })

            player_to_team[player_id] = {
                "fantasy_team": owner_name,
                "team_name": team_name,
                "roster_id": roster["roster_id"]
            }

        roster_info = {
            "roster_id": roster["roster_id"],
            "owner_id": user_id,
            "owner_name": owner_name,
            "team_name": team_name,
            "record": record,
            "players": players_list,
            "starters": roster.get("starters", [])
        }
        roster_data.append(roster_info)

    return roster_data, player_to_team, all_rostered_ids


def get_top_free_agents(nba_players: dict, rostered_ids: set, limit: int = 100) -> list:
    """Get top free agents by Sleeper search rank."""
    free_agents = []

    for sleeper_id, player in nba_players.items():
        if sleeper_id in rostered_ids:
            continue
        if not player.get("team"):  # No NBA team
            continue
        if not player.get("active", False):
            continue

        search_rank = player.get("search_rank")
        if search_rank and search_rank < 500:  # Relevant players only
            free_agents.append({
                "sleeper_id": sleeper_id,
                "name": f"{player.get('first_name', '')} {player.get('last_name', '')}".strip(),
                "team": player.get("team"),
                "position": player.get("position"),
                "search_rank": search_rank,
            })

    # Sort by search rank
    free_agents.sort(key=lambda x: x["search_rank"])
    return free_agents[:limit]


def fetch_game_logs_for_players(players: list, scoring: dict, player_to_team: dict) -> pd.DataFrame:
    """Fetch game logs for a list of players."""
    all_games = []
    total = len(players)

    for i, player in enumerate(players, 1):
        sleeper_id = player["sleeper_id"]
        name = player["name"]
        team = player.get("team", "")
        team_info = player_to_team.get(sleeper_id, {})
        fantasy_team = team_info.get("fantasy_team", "FREE_AGENT")

        # Find NBA player ID
        nba_id = find_nba_player_id(name, team)

        if not nba_id:
            log(f"  [{i}/{total}] {name} - NBA ID not found, skipping")
            continue

        log(f"  [{i}/{total}] {name} (NBA ID: {nba_id})...")

        games = fetch_player_gamelog(nba_id, name)

        for game in games:
            week = get_week_number(game["GAME_DATE"])
            fpts = calculate_fpts(game, scoring)
            minutes = game.get("MIN", 0) or 0

            all_games.append({
                "player": name,
                "sleeper_id": sleeper_id,
                "nba_team": team,
                "fantasy_team": fantasy_team,
                "date": game["GAME_DATE"],
                "week": week,
                "matchup": game.get("MATCHUP", ""),
                "minutes": minutes,
                "fpts": fpts,
                "fpts_per_min": round(fpts / minutes, 2) if minutes > 0 else 0,
                "pts": game.get("PTS", 0),
                "reb": game.get("REB", 0),
                "ast": game.get("AST", 0),
                "stl": game.get("STL", 0),
                "blk": game.get("BLK", 0),
                "tov": game.get("TOV", 0),
                "fgm": game.get("FGM", 0),
                "fga": game.get("FGA", 0),
                "fg_pct": game.get("FG_PCT", 0),
                "ftm": game.get("FTM", 0),
                "fta": game.get("FTA", 0),
                "fg3m": game.get("FG3M", 0)
            })

    return pd.DataFrame(all_games)


def process_data(quick: bool = False, include_free_agents: bool = False, free_agent_limit: int = 100):
    """Main data processing function."""
    log("=" * 60)
    log("SLEEPR Fantasy Basketball Data Refresh")
    log(f"Mode: {'Quick (rosters only)' if quick else 'Full'}")
    if include_free_agents:
        log(f"Including top {free_agent_limit} free agents")
    log("=" * 60)

    # Create directories if needed
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    DASHBOARD_PUBLIC.mkdir(parents=True, exist_ok=True)

    # Fetch Sleeper data
    rosters = fetch_sleeper_rosters()
    users = fetch_sleeper_users()
    league = fetch_sleeper_league()
    nba_players = fetch_sleeper_all_players()

    # Get scoring settings
    scoring = league.get("scoring_settings", {})
    log(f"Scoring settings: {len(scoring)} categories")

    # Save scoring settings
    scoring_path = DASHBOARD_PUBLIC / "scoring.json"
    with open(scoring_path, "w") as f:
        json.dump(scoring, f, indent=2)
    log(f"Saved scoring settings to {scoring_path}")

    # Fetch and save NBA schedule
    try:
        nba_schedule = fetch_nba_schedule()
        schedule_path = DASHBOARD_PUBLIC / "schedule.json"
        with open(schedule_path, "w") as f:
            json.dump(nba_schedule, f)
        log(f"Saved NBA schedule to {schedule_path}")
        log(f"  - {len(nba_schedule['teamSchedules'])} teams")
        log(f"  - Week ends: {nba_schedule['weekEnd']}")
    except Exception as e:
        log(f"Warning: Could not fetch NBA schedule: {e}")

    # Save all NBA players (for free agent lookup in frontend)
    all_players_path = DASHBOARD_PUBLIC / "all_players.json"
    with open(all_players_path, "w") as f:
        json.dump(nba_players, f)
    log(f"Saved all NBA players to {all_players_path}")

    # Process rosters
    roster_data, player_to_team, rostered_ids = process_rosters(users, rosters, nba_players)
    log(f"Found {len(rostered_ids)} rostered players across {len(roster_data)} teams")

    # Save rosters
    rosters_path = DASHBOARD_PUBLIC / "rosters.json"
    with open(rosters_path, "w") as f:
        json.dump(roster_data, f, indent=2)
    log(f"Saved rosters to {rosters_path}")

    if quick:
        log("=" * 60)
        log("Quick Refresh Complete!")
        log("  - Rosters updated")
        log("  - Game logs NOT updated (use full refresh for that)")
        log("=" * 60)
        return

    # Build list of players to fetch game logs for
    players_to_fetch = []

    # Add all rostered players
    for sleeper_id in rostered_ids:
        player_info = nba_players.get(sleeper_id, {})
        if player_info:
            players_to_fetch.append({
                "sleeper_id": sleeper_id,
                "name": f"{player_info.get('first_name', '')} {player_info.get('last_name', '')}".strip(),
                "team": player_info.get("team", ""),
            })

    log(f"Will fetch game logs for {len(players_to_fetch)} rostered players")

    # Optionally add top free agents
    if include_free_agents:
        free_agents = get_top_free_agents(nba_players, rostered_ids, free_agent_limit)
        log(f"Adding {len(free_agents)} top free agents")
        players_to_fetch.extend(free_agents)

    # Fetch game logs
    log(f"Fetching game logs for {len(players_to_fetch)} total players...")
    df = fetch_game_logs_for_players(players_to_fetch, scoring, player_to_team)

    if len(df) > 0:
        # Sort by player, date
        df = df.sort_values(["player", "date"])

        # Save to dashboard public
        csv_path = DASHBOARD_PUBLIC / "games.csv"
        df.to_csv(csv_path, index=False)
        log(f"Saved {len(df)} games to {csv_path}")

        # Save backup
        backup_path = DATA_DIR / f"all_games_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        df.to_csv(backup_path, index=False)
        log(f"Saved backup to {backup_path}")

        # Summary stats
        unique_players = df['player'].nunique()
        max_week = df['week'].max()
    else:
        unique_players = 0
        max_week = 0
        log("Warning: No game data fetched!")

    # Summary
    log("=" * 60)
    log("Data Refresh Complete!")
    log(f"  - Rosters: {len(roster_data)} teams, {len(rostered_ids)} players")
    log(f"  - Game logs: {len(df)} games for {unique_players} players")
    log(f"  - Weeks: {max_week}")
    if include_free_agents:
        fa_games = len(df[df['fantasy_team'] == 'FREE_AGENT']) if len(df) > 0 else 0
        log(f"  - Free agent games: {fa_games}")
    log("=" * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SLEEPR Fantasy Basketball Data Refresh")
    parser.add_argument("--quick", "-q", action="store_true",
                        help="Quick refresh (rosters only, no game logs)")
    parser.add_argument("--free-agents", "-f", action="store_true",
                        help="Include top free agents in game log fetch")
    parser.add_argument("--free-agent-limit", "-n", type=int, default=100,
                        help="Number of top free agents to include (default: 100)")

    args = parser.parse_args()

    try:
        process_data(
            quick=args.quick,
            include_free_agents=args.free_agents,
            free_agent_limit=args.free_agent_limit
        )
    except KeyboardInterrupt:
        log("\nCancelled by user")
        sys.exit(1)
    except Exception as e:
        log(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

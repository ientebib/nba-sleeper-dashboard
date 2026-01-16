#!/usr/bin/env python3
"""
Quick Refresh - Updates rosters and injury info from Sleeper API only.
Use this for quick updates without fetching new game logs.

Usage: python3 quick_refresh.py
"""

import json
import requests
from datetime import datetime
from pathlib import Path

# Configuration
LEAGUE_ID = "1124825745144807424"
DATA_DIR = Path(__file__).parent.parent / "data"
DASHBOARD_PUBLIC = Path(__file__).parent.parent / "dashboard" / "public"
SLEEPER_BASE = "https://api.sleeper.app/v1"


def log(msg: str):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")


def main():
    log("Quick Refresh - Updating from Sleeper API...")

    # Fetch rosters
    rosters = requests.get(f"{SLEEPER_BASE}/league/{LEAGUE_ID}/rosters").json()
    users = {u["user_id"]: u for u in requests.get(f"{SLEEPER_BASE}/league/{LEAGUE_ID}/users").json()}
    nba_players = requests.get(f"{SLEEPER_BASE}/players/nba").json()

    # Build roster data
    roster_data = []
    for roster in rosters:
        user = users.get(roster.get("owner_id"), {})
        roster_data.append({
            "roster_id": roster["roster_id"],
            "owner_id": roster.get("owner_id"),
            "owner_name": user.get("display_name", f"Owner {roster['roster_id']}"),
            "team_name": user.get("metadata", {}).get("team_name", user.get("display_name", f"Team {roster['roster_id']}")),
            "wins": roster.get("settings", {}).get("wins", 0),
            "losses": roster.get("settings", {}).get("losses", 0),
            "players": roster.get("players", []),
            "starters": roster.get("starters", [])
        })

    # Save rosters
    with open(DASHBOARD_PUBLIC / "rosters.json", "w") as f:
        json.dump(roster_data, f, indent=2)
    log(f"Updated rosters ({len(roster_data)} teams)")

    # Update player injuries in games.csv
    import pandas as pd
    games_path = DASHBOARD_PUBLIC / "games.csv"
    if games_path.exists():
        df = pd.read_csv(games_path)

        # Map sleeper_id to injury status
        injuries = {}
        for roster in roster_data:
            for pid in roster["players"]:
                player = nba_players.get(pid, {})
                if player.get("injury_status"):
                    injuries[pid] = player["injury_status"]

        log(f"Found {len(injuries)} injured players")

        # Note: The dashboard computes injury status at runtime from rosters.json
        # This script just ensures the roster data is up to date

    log("Quick refresh complete!")


if __name__ == "__main__":
    main()

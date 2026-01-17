import Papa from 'papaparse';
import type { Game, Roster, ScoringSettings } from '../types';

// Sleeper player type for all NBA players
export interface SleeperPlayer {
  player_id: string;
  full_name: string;
  first_name: string;
  last_name: string;
  team: string | null;
  position: string;
  fantasy_positions: string[];
  status: string;
  active: boolean;
  injury_status: string | null;
  search_rank: number | null;
  age: number;
  years_exp: number;
}

export async function loadGames(): Promise<Game[]> {
  const response = await fetch('/games.csv');
  const csvText = await response.text();

  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(csvText, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const games: Game[] = results.data.map(row => ({
          player: row.player || '',
          sleeper_id: row.sleeper_id || '',
          nba_team: row.nba_team || '',
          fantasy_team: row.fantasy_team || '',
          date: row.date || '',
          week: parseInt(row.week || '0', 10),
          matchup: row.matchup || '',
          minutes: parseFloat(row.minutes || '0'),
          fpts: parseFloat(row.fpts || '0'),
          fpts_per_min: parseFloat(row.fpts_per_min || '0'),
          pts: parseFloat(row.pts || '0'),
          reb: parseFloat(row.reb || '0'),
          ast: parseFloat(row.ast || '0'),
          stl: parseFloat(row.stl || '0'),
          blk: parseFloat(row.blk || '0'),
          tov: parseFloat(row.tov || '0'),
          fgm: parseFloat(row.fgm || '0'),
          fga: parseFloat(row.fga || '0'),
          fg_pct: parseFloat(row.fg_pct || '0'),
          ftm: parseFloat(row.ftm || '0'),
          fta: parseFloat(row.fta || '0'),
          fg3m: parseFloat(row.fg3m || '0'),
        }));
        resolve(games);
      },
      error: (error: Error) => reject(error),
    });
  });
}

export async function loadRosters(): Promise<Roster[]> {
  const response = await fetch('/rosters.json');
  return response.json();
}

export async function loadScoringSettings(): Promise<ScoringSettings> {
  const response = await fetch('/scoring.json');
  return response.json();
}

export async function loadAllPlayers(): Promise<Record<string, SleeperPlayer>> {
  const response = await fetch('/all_players.json');
  return response.json();
}

// NBA Schedule types
export interface GameSchedule {
  date: string;
  opponent: string;
  home: boolean;
  time: string;
}

export interface NBASchedule {
  season: string;
  lastUpdated: string;
  weekEnd: string;
  currentWeek: number;
  teamSchedules: Record<string, GameSchedule[]>;
  remainingThisWeek: Record<string, GameSchedule[]>;
}

// Calculate current fantasy week from date
export function calculateCurrentWeek(weekEndDate: string): number {
  // Fantasy week 1 starts Oct 20, 2025 (Monday)
  // Each week is Mon-Sun, so week 1 = Oct 20-26, week 2 = Oct 27-Nov 2, etc.
  const SEASON_START = new Date('2025-10-20');
  const weekEnd = new Date(weekEndDate);
  // The weekEnd from schedule is the Sunday ending the current week
  // Use the day before (Saturday) to ensure we're calculating the correct week
  const weekEndAdjusted = new Date(weekEnd);
  weekEndAdjusted.setDate(weekEndAdjusted.getDate() - 1);
  const diffTime = weekEndAdjusted.getTime() - SEASON_START.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(1, Math.floor(diffDays / 7) + 1);
}

export async function loadNBASchedule(): Promise<NBASchedule | null> {
  try {
    const response = await fetch('/schedule.json');
    if (!response.ok) return null;
    const data = await response.json();
    // Add calculated current week
    data.currentWeek = calculateCurrentWeek(data.weekEnd);
    return data;
  } catch {
    return null;
  }
}

// Sleeper matchups types
export interface SleeperMatchupTeam {
  roster_id: number;
  starters: string[];
  points: number;
}

// Week -> matchup_id -> [team1, team2]
export type SleeperMatchups = Record<string, Record<string, SleeperMatchupTeam[]>>;

export async function loadSleeperMatchups(): Promise<SleeperMatchups | null> {
  try {
    const response = await fetch('/matchups.json');
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

// Helper to find opponent for a given roster_id and week
export function findOpponentForWeek(
  matchups: SleeperMatchups | null,
  myRosterId: number,
  week: number
): { opponentRosterId: number; myStarters: string[]; opponentStarters: string[] } | null {
  if (!matchups) return null;

  const weekData = matchups[String(week)];
  if (!weekData) return null;

  for (const matchupTeams of Object.values(weekData)) {
    const myTeam = matchupTeams.find(t => t.roster_id === myRosterId);
    if (myTeam) {
      const opponent = matchupTeams.find(t => t.roster_id !== myRosterId);
      if (opponent) {
        return {
          opponentRosterId: opponent.roster_id,
          myStarters: myTeam.starters.filter(id => id !== '0'),
          opponentStarters: opponent.starters.filter(id => id !== '0'),
        };
      }
    }
  }

  return null;
}

// Raw game data from NBA API
export interface Game {
  player: string;
  sleeper_id: string;
  nba_team: string;
  fantasy_team: string;
  date: string;
  week: number;
  matchup: string;
  minutes: number;
  fpts: number;
  fpts_per_min: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  fgm: number;
  fga: number;
  fg_pct: number;
  ftm: number;
  fta: number;
  fg3m: number;
}

// Roster player from Sleeper
export interface RosterPlayer {
  sleeper_id: string;
  name: string;
  team: string;
  position: string;
  injury_status: string | null;
}

// Fantasy team roster
export interface Roster {
  roster_id: number;
  owner_id: string;
  owner_name: string;
  team_name: string;
  record: string;
  players: RosterPlayer[];
}

// Scoring settings
export interface ScoringSettings {
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  to: number;
  fgm: number;
  fga: number;
  ftm: number;
  fta: number;
  tpm: number;
  td: number;
  bonus_pt_40p: number;
  bonus_pt_50p: number;
  bonus_ast_15p: number;
  bonus_reb_20p: number;
}

// Computed player analytics
export interface PlayerAnalytics {
  player: string;
  sleeper_id: string;
  nba_team: string;
  fantasy_team: string;
  position: string;
  injury_status: string | null;

  // Overall stats
  totalGames: number;
  weeksPlayed: number;
  gamesPerWeek: number;

  // Minutes analysis
  avgMinutes: number;
  stdMinutes: number;
  minMinutes: number;
  maxMinutes: number;
  minuteCV: number; // Coefficient of variation

  // Fantasy points
  totalFpts: number;
  avgFpts: number;
  medianFpts: number;
  stdFpts: number;
  minFpts: number;
  maxFpts: number;
  fptsPerMin: number;

  // Lock-in analysis (key for Lock-In format!)
  expectedLockin: number; // Avg of weekly max - optimal lock-in value
  lockinFloor: number;    // Worst weekly max
  lockinCeiling: number;  // Best weekly max
  lockinEfficiency: number; // expectedLockin / avgFpts
  weeklyUpside: number;   // expectedLockin - avgFpts

  // Percentiles
  floor10pct: number;
  ceiling90pct: number;
  pct60plus: number;
  pct50plus: number;
  pct45plus: number;
  pctUnder35: number;

  // Period analysis (Early: wk1-4, Mid: wk5-8, Recent: wk9+)
  early: PeriodStats;
  mid: PeriodStats;
  recent: PeriodStats;

  // Trends
  lockinTrend: 'RISING' | 'FALLING' | 'STABLE';
  lockinTrendPct: number;
  minutesTrend: 'MORE_MINUTES' | 'FEWER_MINUTES' | 'SAME';
  consistencyTrend: 'MORE_CONSISTENT' | 'LESS_CONSISTENT' | 'SAME';

  // Week-by-week data
  weeklyStats: WeeklyStats[];

  // All games for this player
  games: Game[];
}

export interface PeriodStats {
  games: number;
  avgMinutes: number;
  minuteCV: number;
  avgFpts: number;
  expectedLockin: number;
  bestMax: number;
  worstMax: number;
}

export interface WeeklyStats {
  week: number;
  games: number;
  maxFpts: number;
  minFpts: number;
  avgFpts: number;
  totalFpts: number;
  avgMinutes: number;
  gamesList: Game[];
}

// Team analytics
export interface TeamAnalytics {
  rosterId: number;
  ownerName: string;
  teamName: string;
  record: string;
  wins: number;
  losses: number;

  // Roster totals
  totalExpectedLockin: number; // Sum of all player expected lock-ins
  avgExpectedLockin: number;

  // Best performers
  topLockinPlayers: PlayerAnalytics[];

  // Weekly performance
  weeklyTotalMaxFpts: number[]; // Max possible points per week

  // Player list with analytics
  players: PlayerAnalytics[];
}

// For trade machine
export interface TradeAnalysis {
  player1: PlayerAnalytics;
  player2: PlayerAnalytics;
  lockinDiff: number;
  avgDiff: number;
  ceilingDiff: number;
  floorDiff: number;
  trendComparison: string;
  recommendation: 'FAVOR_1' | 'FAVOR_2' | 'EVEN';
}

// Filter state
export interface FilterState {
  weeks: number[];
  teams: string[];
  positions: string[];
  minGames: number;
  searchQuery: string;
}

// App views
export type ViewType = 'dashboard' | 'players' | 'teams' | 'trade' | 'streaming' | 'h2h' | 'player-detail' | 'team-detail';

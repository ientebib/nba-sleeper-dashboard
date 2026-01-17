import type {
  Game,
  PlayerAnalytics,
  TeamAnalytics,
  Roster,
  WeeklyStats,
  PeriodStats,
  TradeAnalysis,
} from '../types';
import type { NBASchedule } from './dataLoader';

// ============================================
// SHARED CONSTANTS
// All components should use these instead of defining locally
// ============================================

export type TimePeriod = 'all' | 'L2W' | 'L3W' | 'L4W' | 'L6W' | 'L8W';

export const TIME_PERIODS: { value: TimePeriod; label: string; weeks: number }[] = [
  { value: 'all', label: 'Season', weeks: 99 },
  { value: 'L2W', label: '2W', weeks: 2 },
  { value: 'L3W', label: '3W', weeks: 3 },
  { value: 'L4W', label: '4W', weeks: 4 },
  { value: 'L6W', label: '6W', weeks: 6 },
  { value: 'L8W', label: '8W', weeks: 8 },
];

// Chart colors used across comparison panels
export const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

// Compute standard deviation
function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
}

// Compute median
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Compute percentile
function percentile(values: number[], pct: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor((pct / 100) * sorted.length);
  return sorted[Math.min(idx, sorted.length - 1)];
}

// Group games by player
export function groupGamesByPlayer(games: Game[]): Map<string, Game[]> {
  const grouped = new Map<string, Game[]>();
  for (const game of games) {
    const key = game.sleeper_id;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(game);
  }
  return grouped;
}

// Compute weekly stats for a player
function computeWeeklyStats(games: Game[]): WeeklyStats[] {
  const byWeek = new Map<number, Game[]>();
  for (const game of games) {
    if (!byWeek.has(game.week)) {
      byWeek.set(game.week, []);
    }
    byWeek.get(game.week)!.push(game);
  }

  const weeks: WeeklyStats[] = [];
  for (const [week, weekGames] of byWeek.entries()) {
    const fpts = weekGames.map(g => g.fpts);
    const minutes = weekGames.map(g => g.minutes);
    weeks.push({
      week,
      games: weekGames.length,
      maxFpts: Math.max(...fpts),
      minFpts: Math.min(...fpts),
      avgFpts: fpts.reduce((a, b) => a + b, 0) / fpts.length,
      totalFpts: fpts.reduce((a, b) => a + b, 0),
      avgMinutes: minutes.reduce((a, b) => a + b, 0) / minutes.length,
      gamesList: weekGames.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    });
  }

  return weeks.sort((a, b) => a.week - b.week);
}

// Compute period stats (Early: 1-4, Mid: 5-8, Recent: 9+)
function computePeriodStats(weeklyStats: WeeklyStats[], period: 'early' | 'mid' | 'recent'): PeriodStats {
  let filtered: WeeklyStats[];
  if (period === 'early') {
    filtered = weeklyStats.filter(w => w.week >= 1 && w.week <= 4);
  } else if (period === 'mid') {
    filtered = weeklyStats.filter(w => w.week >= 5 && w.week <= 8);
  } else {
    filtered = weeklyStats.filter(w => w.week >= 9);
  }

  if (filtered.length === 0) {
    return {
      games: 0,
      avgMinutes: 0,
      minuteCV: 0,
      avgFpts: 0,
      expectedLockin: 0,
      bestMax: 0,
      worstMax: 0,
    };
  }

  const allGames = filtered.flatMap(w => w.gamesList);
  const minutes = allGames.map(g => g.minutes);
  const fpts = allGames.map(g => g.fpts);
  const maxes = filtered.map(w => w.maxFpts);
  const avgMin = minutes.length > 0 ? minutes.reduce((a, b) => a + b, 0) / minutes.length : 0;

  return {
    games: allGames.length,
    avgMinutes: avgMin,
    minuteCV: avgMin > 0 ? (stdDev(minutes) / avgMin) * 100 : 0,
    avgFpts: fpts.length > 0 ? fpts.reduce((a, b) => a + b, 0) / fpts.length : 0,
    expectedLockin: maxes.length > 0 ? maxes.reduce((a, b) => a + b, 0) / maxes.length : 0,
    bestMax: maxes.length > 0 ? Math.max(...maxes) : 0,
    worstMax: maxes.length > 0 ? Math.min(...maxes) : 0,
  };
}

// Compute trends
function computeTrends(early: PeriodStats, recent: PeriodStats): {
  lockinTrend: 'RISING' | 'FALLING' | 'STABLE';
  lockinTrendPct: number;
  minutesTrend: 'MORE_MINUTES' | 'FEWER_MINUTES' | 'SAME';
  consistencyTrend: 'MORE_CONSISTENT' | 'LESS_CONSISTENT' | 'SAME';
} {
  // Lock-in trend
  let lockinTrendPct = 0;
  let lockinTrend: 'RISING' | 'FALLING' | 'STABLE' = 'STABLE';
  if (early.expectedLockin > 0) {
    lockinTrendPct = ((recent.expectedLockin - early.expectedLockin) / early.expectedLockin) * 100;
    if (lockinTrendPct > 10) lockinTrend = 'RISING';
    else if (lockinTrendPct < -10) lockinTrend = 'FALLING';
  }

  // Minutes trend
  let minutesTrend: 'MORE_MINUTES' | 'FEWER_MINUTES' | 'SAME' = 'SAME';
  if (early.avgMinutes > 0) {
    const minutesDiff = ((recent.avgMinutes - early.avgMinutes) / early.avgMinutes) * 100;
    if (minutesDiff > 10) minutesTrend = 'MORE_MINUTES';
    else if (minutesDiff < -10) minutesTrend = 'FEWER_MINUTES';
  }

  // Consistency trend (lower CV = more consistent)
  let consistencyTrend: 'MORE_CONSISTENT' | 'LESS_CONSISTENT' | 'SAME' = 'SAME';
  if (early.minuteCV > 0) {
    const cvDiff = recent.minuteCV - early.minuteCV;
    if (cvDiff < -5) consistencyTrend = 'MORE_CONSISTENT';
    else if (cvDiff > 5) consistencyTrend = 'LESS_CONSISTENT';
  }

  return { lockinTrend, lockinTrendPct, minutesTrend, consistencyTrend };
}

// Main analytics computation
export function computePlayerAnalytics(
  games: Game[],
  rosters: Roster[],
  allNbaPlayers?: Record<string, { position?: string; fantasy_positions?: string[]; injury_status?: string | null }>
): PlayerAnalytics[] {
  const playerGames = groupGamesByPlayer(games);
  const analytics: PlayerAnalytics[] = [];

  // Create a map of sleeper_id to roster info
  const rosterMap = new Map<string, { position: string; injury_status: string | null }>();
  for (const roster of rosters) {
    for (const player of roster.players) {
      rosterMap.set(player.sleeper_id, {
        position: player.position,
        injury_status: player.injury_status,
      });
    }
  }

  for (const [sleeperId, playerGamesList] of playerGames.entries()) {
    if (playerGamesList.length === 0) continue;

    const first = playerGamesList[0];
    const rosterInfo = rosterMap.get(sleeperId);

    // Get info from allNbaPlayers if not in roster (free agents)
    const nbaPlayerInfo = allNbaPlayers?.[sleeperId];
    // Use fantasy_positions array if available, otherwise fall back to single position
    const fantasyPositions = nbaPlayerInfo?.fantasy_positions;
    const position = fantasyPositions && fantasyPositions.length > 0
      ? fantasyPositions.join('/')
      : (rosterInfo?.position || nbaPlayerInfo?.position || 'N/A');
    const injury_status = rosterInfo?.injury_status ?? nbaPlayerInfo?.injury_status ?? null;

    // Filter out DNP games (minutes < 1) for calculations
    const validGames = playerGamesList.filter(g => g.minutes >= 1);
    if (validGames.length === 0) continue;

    // Sort by date
    validGames.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Basic stats
    const fptsValues = validGames.map(g => g.fpts);
    const minutesValues = validGames.map(g => g.minutes);
    const totalFpts = fptsValues.reduce((a, b) => a + b, 0);
    const avgFpts = totalFpts / fptsValues.length;
    const avgMinutes = minutesValues.reduce((a, b) => a + b, 0) / minutesValues.length;

    // Weekly analysis
    const weeklyStats = computeWeeklyStats(validGames);
    const weeksPlayed = weeklyStats.length;
    const weeklyMaxes = weeklyStats.map(w => w.maxFpts);
    const expectedLockin = weeklyMaxes.length > 0
      ? weeklyMaxes.reduce((a, b) => a + b, 0) / weeklyMaxes.length
      : 0;

    // Period analysis
    const early = computePeriodStats(weeklyStats, 'early');
    const mid = computePeriodStats(weeklyStats, 'mid');
    const recent = computePeriodStats(weeklyStats, 'recent');

    // Trends
    const trends = computeTrends(early, recent);

    analytics.push({
      player: first.player,
      sleeper_id: sleeperId,
      nba_team: first.nba_team,
      fantasy_team: first.fantasy_team,
      position,
      injury_status,

      totalGames: validGames.length,
      weeksPlayed,
      gamesPerWeek: weeksPlayed > 0 ? validGames.length / weeksPlayed : 0,

      avgMinutes,
      stdMinutes: stdDev(minutesValues),
      minMinutes: Math.min(...minutesValues),
      maxMinutes: Math.max(...minutesValues),
      minuteCV: avgMinutes > 0 ? (stdDev(minutesValues) / avgMinutes) * 100 : 0,

      totalFpts,
      avgFpts,
      medianFpts: median(fptsValues),
      stdFpts: stdDev(fptsValues),
      minFpts: Math.min(...fptsValues),
      maxFpts: Math.max(...fptsValues),
      fptsPerMin: avgMinutes > 0 ? avgFpts / avgMinutes : 0,

      expectedLockin,
      lockinFloor: weeklyMaxes.length > 0 ? Math.min(...weeklyMaxes) : 0,
      lockinCeiling: weeklyMaxes.length > 0 ? Math.max(...weeklyMaxes) : 0,
      lockinEfficiency: avgFpts > 0 ? expectedLockin / avgFpts : 0,
      weeklyUpside: expectedLockin - avgFpts,

      floor10pct: percentile(fptsValues, 10),
      ceiling90pct: percentile(fptsValues, 90),
      pct60plus: (fptsValues.filter(f => f >= 60).length / fptsValues.length) * 100,
      pct50plus: (fptsValues.filter(f => f >= 50).length / fptsValues.length) * 100,
      pct45plus: (fptsValues.filter(f => f >= 45).length / fptsValues.length) * 100,
      pctUnder35: (fptsValues.filter(f => f < 35).length / fptsValues.length) * 100,

      early,
      mid,
      recent,

      ...trends,

      weeklyStats,
      games: validGames,
    });
  }

  return analytics;
}

// Compute team analytics
export function computeTeamAnalytics(
  players: PlayerAnalytics[],
  rosters: Roster[]
): TeamAnalytics[] {
  const teams: TeamAnalytics[] = [];

  const STARTER_COUNT = 10; // Number of starters in lineup

  for (const roster of rosters) {
    const teamPlayers = players.filter(p => p.fantasy_team === roster.owner_name);
    const [wins, losses] = roster.record.split('-').map(Number);

    // Sort players by expected lock-in and take top 10 (starters)
    const sortedPlayers = [...teamPlayers].sort((a, b) => b.expectedLockin - a.expectedLockin);
    const starters = sortedPlayers.slice(0, STARTER_COUNT);

    // Total Lock-In is sum of top 10 starters only
    const totalExpectedLockin = starters.reduce((sum, p) => sum + p.expectedLockin, 0);

    // Compute weekly team totals (sum of top 10 players' max for that week)
    const weeklyTotals: number[] = [];
    for (let week = 1; week <= 13; week++) {
      // Get each player's max for this week, sort, take top 10
      const playerWeekMaxes = teamPlayers.map(player => {
        const weekStat = player.weeklyStats.find(w => w.week === week);
        return weekStat?.maxFpts || 0;
      }).sort((a, b) => b - a);
      const weekTotal = playerWeekMaxes.slice(0, STARTER_COUNT).reduce((sum, v) => sum + v, 0);
      weeklyTotals.push(weekTotal);
    }

    teams.push({
      rosterId: roster.roster_id,
      ownerName: roster.owner_name,
      teamName: roster.team_name || roster.owner_name, // Fallback to owner name if no team name
      record: roster.record,
      wins,
      losses,
      totalExpectedLockin,
      avgExpectedLockin: starters.length > 0 ? totalExpectedLockin / starters.length : 0,
      topLockinPlayers: sortedPlayers.slice(0, 5),
      weeklyTotalMaxFpts: weeklyTotals,
      players: teamPlayers,
    });
  }

  return teams.sort((a, b) => b.wins - a.wins || b.totalExpectedLockin - a.totalExpectedLockin);
}

// Trade analysis
export function analyzeTraade(player1: PlayerAnalytics, player2: PlayerAnalytics): TradeAnalysis {
  const lockinDiff = player1.expectedLockin - player2.expectedLockin;
  const avgDiff = player1.avgFpts - player2.avgFpts;
  const ceilingDiff = player1.lockinCeiling - player2.lockinCeiling;
  const floorDiff = player1.lockinFloor - player2.lockinFloor;

  let recommendation: 'FAVOR_1' | 'FAVOR_2' | 'EVEN' = 'EVEN';
  if (lockinDiff > 5) recommendation = 'FAVOR_1';
  else if (lockinDiff < -5) recommendation = 'FAVOR_2';

  // Trend comparison
  let trendComparison = '';
  if (player1.lockinTrend === 'RISING' && player2.lockinTrend !== 'RISING') {
    trendComparison = `${player1.player} is trending UP while ${player2.player} is ${player2.lockinTrend.toLowerCase()}`;
  } else if (player2.lockinTrend === 'RISING' && player1.lockinTrend !== 'RISING') {
    trendComparison = `${player2.player} is trending UP while ${player1.player} is ${player1.lockinTrend.toLowerCase()}`;
  } else if (player1.lockinTrend === player2.lockinTrend) {
    trendComparison = `Both players are ${player1.lockinTrend.toLowerCase()}`;
  } else {
    trendComparison = `${player1.player} is ${player1.lockinTrend.toLowerCase()}, ${player2.player} is ${player2.lockinTrend.toLowerCase()}`;
  }

  return {
    player1,
    player2,
    lockinDiff,
    avgDiff,
    ceilingDiff,
    floorDiff,
    trendComparison,
    recommendation,
  };
}

// ============================================
// SHARED CALCULATION ENGINE
// All components MUST use these instead of local duplicates
// This is the SINGLE SOURCE OF TRUTH for all calculations
// ============================================

// ============================================
// INJURY STATUS CONSTANTS
// ============================================

// Players who are definitely OUT and shouldn't be considered for streaming/trades
export const INJURY_STATUS_OUT = ['OUT', 'OFS', 'SUS'];

// Players on Injury Reserve - likely out for extended time or season
export const INJURY_STATUS_IR = ['IR', 'Injured Reserve', 'PUP'];

// All statuses that mean player is not currently available
export const INJURY_STATUS_UNAVAILABLE = [...INJURY_STATUS_OUT, ...INJURY_STATUS_IR];

/**
 * Check if a player is currently OUT (short-term, may return soon)
 */
export function isPlayerOut(player: { injury_status?: string | null }): boolean {
  const status = player.injury_status?.toUpperCase();
  if (!status) return false;
  return INJURY_STATUS_OUT.some(s => status.includes(s));
}

/**
 * Check if a player is on IR (long-term, likely out for extended period)
 */
export function isPlayerIR(player: { injury_status?: string | null }): boolean {
  const status = player.injury_status?.toUpperCase();
  if (!status) return false;
  return INJURY_STATUS_IR.some(s => status.includes(s));
}

/**
 * Check if a player is unavailable (either OUT or IR)
 */
export function isPlayerUnavailable(player: { injury_status?: string | null }): boolean {
  return isPlayerOut(player) || isPlayerIR(player);
}

/**
 * Filter players by injury status
 * @param players - Array of players with injury_status
 * @param hideOut - Hide players with OUT status
 * @param hideIR - Hide players on IR
 */
export function filterByInjuryStatus<T extends { injury_status?: string | null }>(
  players: T[],
  hideOut: boolean = true,
  hideIR: boolean = true
): T[] {
  return players.filter(p => {
    if (hideOut && isPlayerOut(p)) return false;
    if (hideIR && isPlayerIR(p)) return false;
    return true;
  });
}

// ============================================
// PERIOD CALCULATION UTILITIES
// ============================================

export interface PeriodPlayerStats {
  expectedLockin: number;
  medianLockin: number;
  avgFpts: number;
  ceiling: number;
  floor: number;
  avgMinutes: number;
  games: number;
  weeks: number;
  pct40plus: number;
  pct45plus: number;
  pctBust: number;
  reliability: number;
}

/**
 * Calculate player stats for a specific time period
 * This is the SINGLE SOURCE OF TRUTH for period-filtered calculations
 * All components (TradeMachine, StreamingPanel, Dashboard, etc.) should use this
 *
 * @param player - PlayerAnalytics object with weeklyStats
 * @param maxWeeks - Number of weeks to include (99 = all/season)
 * @returns PeriodPlayerStats with all calculated metrics
 */
export function calcPlayerPeriodStats(player: PlayerAnalytics, maxWeeks: number): PeriodPlayerStats {
  if (!player.weeklyStats || player.weeklyStats.length === 0) {
    return {
      expectedLockin: 0,
      medianLockin: 0,
      avgFpts: 0,
      ceiling: 0,
      floor: 0,
      avgMinutes: 0,
      games: 0,
      weeks: 0,
      pct40plus: 0,
      pct45plus: 0,
      pctBust: 0,
      reliability: 0,
    };
  }

  const currentWeek = Math.max(...player.weeklyStats.map(w => w.week));
  const minWeek = maxWeeks === 99 ? 1 : currentWeek - maxWeeks + 1;
  const filteredWeeks = player.weeklyStats.filter(w => w.week >= minWeek);

  if (filteredWeeks.length === 0) {
    return {
      expectedLockin: 0,
      medianLockin: 0,
      avgFpts: 0,
      ceiling: 0,
      floor: 0,
      avgMinutes: 0,
      games: 0,
      weeks: 0,
      pct40plus: 0,
      pct45plus: 0,
      pctBust: 0,
      reliability: 0,
    };
  }

  const maxFptsList = filteredWeeks.map(w => w.maxFpts);
  const avgFptsList = filteredWeeks.map(w => w.avgFpts);
  const minutesList = filteredWeeks.map(w => w.avgMinutes);
  const totalWeeks = maxFptsList.length;

  const avgLockin = maxFptsList.reduce((a, b) => a + b, 0) / totalWeeks;
  const ceiling = Math.max(...maxFptsList);
  const floor = Math.min(...maxFptsList);

  // Median lock-in
  const sortedMaxes = [...maxFptsList].sort((a, b) => a - b);
  const mid = Math.floor(sortedMaxes.length / 2);
  const medianLockin = sortedMaxes.length % 2 !== 0
    ? sortedMaxes[mid]
    : (sortedMaxes[mid - 1] + sortedMaxes[mid]) / 2;

  // Reliability metrics
  const weeks40plus = maxFptsList.filter(v => v >= 40).length;
  const weeks45plus = maxFptsList.filter(v => v >= 45).length;
  const weeksBust = maxFptsList.filter(v => v < 35).length;

  const pct40plus = (weeks40plus / totalWeeks) * 100;
  const pct45plus = (weeks45plus / totalWeeks) * 100;
  const pctBust = (weeksBust / totalWeeks) * 100;

  // Composite Reliability Score
  const reliability = (pct40plus * 0.5) + (pct45plus * 0.3) + ((100 - pctBust) * 0.2);

  return {
    expectedLockin: avgLockin,
    medianLockin,
    avgFpts: avgFptsList.reduce((a, b) => a + b, 0) / avgFptsList.length,
    ceiling,
    floor,
    avgMinutes: minutesList.reduce((a, b) => a + b, 0) / minutesList.length,
    games: filteredWeeks.reduce((sum, w) => sum + w.games, 0),
    weeks: totalWeeks,
    pct40plus,
    pct45plus,
    pctBust,
    reliability: Math.max(0, Math.min(100, reliability)),
  };
}

/**
 * Calculate Lock-In for a specific week range (for trends)
 * @param player - PlayerAnalytics object
 * @param startWeeksAgo - Start of range (e.g., 4 = starting 4 weeks ago)
 * @param endWeeksAgo - End of range (e.g., 0 = up to current week)
 * @returns Average lock-in for that range, or null if no data
 */
export function calcLockinForWeekRange(
  player: PlayerAnalytics,
  startWeeksAgo: number,
  endWeeksAgo: number = 0
): number | null {
  if (!player.weeklyStats || player.weeklyStats.length === 0) return null;

  const currentWeek = Math.max(...player.weeklyStats.map(w => w.week));
  const startWeek = currentWeek - startWeeksAgo + 1;
  const endWeek = currentWeek - endWeeksAgo;

  const filteredWeeks = player.weeklyStats.filter(w => w.week >= startWeek && w.week <= endWeek);
  if (filteredWeeks.length === 0) return null;

  const maxes = filteredWeeks.map(w => w.maxFpts);
  return maxes.reduce((a, b) => a + b, 0) / maxes.length;
}

/**
 * Calculate all trend comparisons for a player
 * Used for short-term momentum (Δ2v4) and medium-term trend (Δ4v8)
 */
export function calcPlayerTrends(player: PlayerAnalytics) {
  const l2w = calcLockinForWeekRange(player, 2, 0);  // Last 2 weeks
  const l4w = calcLockinForWeekRange(player, 4, 0);  // Last 4 weeks
  const l6w = calcLockinForWeekRange(player, 6, 0);  // Last 6 weeks
  const l8w = calcLockinForWeekRange(player, 8, 0);  // Last 8 weeks
  const prev2w = calcLockinForWeekRange(player, 4, 2);  // Weeks 3-4 ago
  const prev4w = calcLockinForWeekRange(player, 8, 4);  // Weeks 5-8 ago

  // Δ2v4: Recent 2 weeks vs prior 2 weeks (short-term momentum)
  const delta2v4 = (l2w !== null && prev2w !== null && prev2w > 0)
    ? ((l2w - prev2w) / prev2w) * 100
    : null;

  // Δ4v8: Recent 4 weeks vs prior 4 weeks (medium-term trend)
  const delta4v8 = (l4w !== null && prev4w !== null && prev4w > 0)
    ? ((l4w - prev4w) / prev4w) * 100
    : null;

  return {
    l2w,
    l4w,
    l6w,
    l8w,
    delta2v4,
    delta4v8,
  };
}

// ============================================
// THIS WEEK LOCK-IN DECISION ENGINE
// Canonical calculations for lock/wait recommendations
// ============================================

export interface ThisWeekAnalysis {
  // Current week data
  currentBest: number;
  gamesPlayed: number;
  gamesRemaining: number;

  // Ceiling/Floor calculated from HEALTHY games in recent form
  realisticCeiling: number;    // 85th percentile of filtered L6W games
  realisticFloor: number;      // 15th percentile of filtered L6W games
  expectedValue: number;       // Median of filtered L6W games

  // Probability metrics
  singleGameChance: number;    // % chance ONE game beats currentBest
  chanceToImprove: number;     // Combined probability across ALL remaining games
  chanceToHitCeiling: number;  // % chance to hit near-ceiling in remaining games

  // Recommendation
  recommendation: 'LOCK' | 'HOLD' | 'WAIT';
  confidence: number;          // 0-100 confidence in recommendation

  // Supporting data
  filteredGamesCount: number;  // How many games were used for calculation
  avgMinutesRecent: number;    // Average minutes in filtered period
  minMinutesThreshold: number; // Minimum minutes used for filtering
}

/**
 * Get healthy, full-minutes games from recent weeks
 * Filters out injury-limited games, blowouts, and DNPs
 *
 * @param player - PlayerAnalytics with game data
 * @param weeksBack - How many weeks to look back (default 6)
 * @param minMinutesOverride - Override minimum minutes threshold
 */
export function getHealthyRecentGames(
  player: PlayerAnalytics,
  weeksBack: number = 6,
  minMinutesOverride?: number
): { games: typeof player.games; avgMinutes: number; minMinutesThreshold: number } {
  if (!player.games || player.games.length === 0) {
    return { games: [], avgMinutes: 0, minMinutesThreshold: 15 };
  }

  // Get current week
  const currentWeek = Math.max(...player.games.map(g => g.week));
  const minWeek = currentWeek - weeksBack + 1;

  // Filter to recent weeks first
  const recentGames = player.games.filter(g => g.week >= minWeek && g.week <= currentWeek);

  if (recentGames.length === 0) {
    return { games: [], avgMinutes: 0, minMinutesThreshold: 15 };
  }

  // Calculate player's average minutes from recent games (excluding DNPs)
  const gamesWithMinutes = recentGames.filter(g => g.minutes >= 10);
  const avgMinutes = gamesWithMinutes.length > 0
    ? gamesWithMinutes.reduce((sum, g) => sum + g.minutes, 0) / gamesWithMinutes.length
    : 20;

  // Minimum minutes threshold: player's avg - 5 (or override)
  // This filters out injury-limited and blowout games
  const minMinutesThreshold = minMinutesOverride ?? Math.max(15, avgMinutes - 5);

  // Filter to healthy, full-minutes games
  const healthyGames = recentGames.filter(g => g.minutes >= minMinutesThreshold);

  return { games: healthyGames, avgMinutes, minMinutesThreshold };
}

/**
 * Calculate realistic ceiling, floor, and expected value
 * Uses percentile-based approach on filtered healthy games
 *
 * CEILING LOGIC:
 * - Use the HIGHER of: 85th percentile OR best game in last 2 weeks
 * - This prevents underestimating ceiling for boom/bust players
 * - A recent monster game should inform the ceiling
 */
export function calcRealisticBounds(
  games: { fpts: number; minutes: number }[],
  recentGames?: { fpts: number }[] // Optional: last 2 weeks for recency adjustment
): {
  ceiling: number;   // max(85th percentile, recent max)
  floor: number;     // 15th percentile
  expected: number;  // Median (50th percentile)
  avg: number;       // Simple average
  pct85: number;     // Raw 85th percentile (for display)
  recentMax: number; // Max from recent games (for display)
} {
  if (games.length === 0) {
    return { ceiling: 0, floor: 0, expected: 0, avg: 0, pct85: 0, recentMax: 0 };
  }

  const fptsList = games.map(g => g.fpts).sort((a, b) => a - b);
  const n = fptsList.length;

  // Percentile helper
  const getPct = (pct: number) => {
    const idx = Math.floor((pct / 100) * n);
    return fptsList[Math.min(idx, n - 1)];
  };

  const pct85 = getPct(85);

  // Recent max (last 2 weeks if provided, otherwise last 25% of games)
  const recentMax = recentGames && recentGames.length > 0
    ? Math.max(...recentGames.map(g => g.fpts))
    : Math.max(...fptsList.slice(-Math.max(3, Math.floor(n * 0.25))));

  // Ceiling = higher of 85th percentile or recent max
  // This ensures a recent monster game informs the ceiling
  const ceiling = Math.max(pct85, recentMax);

  return {
    ceiling,
    floor: getPct(15),
    expected: getPct(50),
    avg: fptsList.reduce((a, b) => a + b, 0) / n,
    pct85,
    recentMax,
  };
}

/**
 * Calculate chance to beat a given score
 * Based on filtered healthy games
 */
export function calcChanceToBeat(games: { fpts: number }[], target: number): number {
  if (games.length === 0) return 0;

  const gamesAboveTarget = games.filter(g => g.fpts > target).length;
  return (gamesAboveTarget / games.length) * 100;
}

/**
 * MAIN: Analyze a player's current week and provide lock/wait recommendation
 *
 * @param player - PlayerAnalytics with all game data
 * @param currentWeek - The current fantasy week number
 * @param gamesRemaining - Number of games remaining this week
 * @param scoreOverride - Optional: manually selected score to evaluate (for "what if" scenarios)
 */
export function analyzeThisWeek(
  player: PlayerAnalytics,
  currentWeek: number,
  gamesRemaining: number = 0,
  scoreOverride?: number
): ThisWeekAnalysis {
  // Get this week's games
  const thisWeekGames = player.games?.filter(g => g.week === currentWeek) || [];
  const gamesPlayed = thisWeekGames.length;
  const actualBest = gamesPlayed > 0 ? Math.max(...thisWeekGames.map(g => g.fpts)) : 0;

  // Use override if provided (for simulating "what if I lock this game?")
  const currentBest = scoreOverride !== undefined ? scoreOverride : actualBest;

  // Get healthy recent games for baseline calculations (L6W)
  const { games: healthyGames, avgMinutes, minMinutesThreshold } = getHealthyRecentGames(player, 6);

  // Get last 2 weeks of games for recency-adjusted ceiling
  const { games: last2WeeksGames } = getHealthyRecentGames(player, 2);

  // Calculate realistic bounds from healthy games
  // Pass recent games so ceiling = max(85th percentile, recent max)
  const bounds = calcRealisticBounds(healthyGames, last2WeeksGames);

  // Calculate SINGLE GAME probability of beating current score
  const singleGameProbBeat = calcChanceToBeat(healthyGames, currentBest) / 100; // as decimal

  // Calculate MULTI-GAME probability of improvement
  // P(at least one game beats current) = 1 - P(all games fail to beat)
  // P(all fail) = (1 - singleGameProb)^gamesRemaining
  let chanceToImprove = 0;
  if (gamesRemaining > 0 && singleGameProbBeat > 0) {
    const probAllFail = Math.pow(1 - singleGameProbBeat, gamesRemaining);
    chanceToImprove = (1 - probAllFail) * 100;
  }

  // Also store single game prob for display
  const singleGameChance = singleGameProbBeat * 100;

  // Calculate chance of hitting ceiling (within 90% of ceiling)
  const ceilingThreshold = bounds.ceiling * 0.9;
  const singleGameCeilingProb = calcChanceToBeat(
    healthyGames.map(g => ({ fpts: g.fpts })),
    ceilingThreshold - 0.01
  ) / 100;
  const chanceToHitCeiling = gamesRemaining > 0
    ? (1 - Math.pow(1 - singleGameCeilingProb, gamesRemaining)) * 100
    : 0;

  // Determine recommendation
  let recommendation: 'LOCK' | 'HOLD' | 'WAIT';
  let confidence: number;

  if (gamesRemaining === 0) {
    // No games left - must lock
    recommendation = 'LOCK';
    confidence = 100;
  } else if (gamesPlayed === 0) {
    // No games played yet - must wait
    recommendation = 'WAIT';
    confidence = 100;
  } else {
    // Decision logic based on chance to improve
    // Key insight: if chance to improve is LOW, current score is likely best → LOCK
    // If chance to improve is HIGH, wait for better game → WAIT

    // Also consider: how good is current vs ceiling?
    const currentVsCeiling = bounds.ceiling > 0 ? (currentBest / bounds.ceiling) * 100 : 0;

    if (chanceToImprove < 30) {
      // Low chance to improve - lock it in
      recommendation = 'LOCK';
      confidence = Math.min(95, 100 - chanceToImprove);
    } else if (chanceToImprove > 55) {
      // Good chance to improve - wait
      recommendation = 'WAIT';
      confidence = Math.min(95, chanceToImprove);
    } else if (currentVsCeiling >= 85) {
      // Already near ceiling - lock even if borderline chance
      recommendation = 'LOCK';
      confidence = 70 + (currentVsCeiling - 85);
    } else if (currentVsCeiling < 60 && gamesRemaining >= 2) {
      // Far from ceiling with multiple games left - wait
      recommendation = 'WAIT';
      confidence = 65;
    } else {
      // Borderline - hold/coin flip
      recommendation = 'HOLD';
      confidence = 50;
    }
  }

  return {
    currentBest,
    gamesPlayed,
    gamesRemaining,
    realisticCeiling: bounds.ceiling,
    realisticFloor: bounds.floor,
    expectedValue: bounds.expected,
    singleGameChance,
    chanceToImprove,
    chanceToHitCeiling,
    recommendation,
    confidence,
    filteredGamesCount: healthyGames.length,
    avgMinutesRecent: avgMinutes,
    minMinutesThreshold,
  };
}

/**
 * Get recommendation label with emoji for display
 */
export function getRecommendationDisplay(analysis: ThisWeekAnalysis): {
  label: string;
  color: string;
  description: string;
} {
  switch (analysis.recommendation) {
    case 'LOCK':
      return {
        label: 'LOCK',
        color: '#10b981', // green
        description: `${(100 - analysis.chanceToImprove).toFixed(0)}% likely this is your best score`,
      };
    case 'WAIT':
      return {
        label: 'WAIT',
        color: '#f59e0b', // amber
        description: `${analysis.chanceToImprove.toFixed(0)}% chance to improve with ${analysis.gamesRemaining} game(s) left`,
      };
    case 'HOLD':
      return {
        label: 'HOLD',
        color: '#6b7280', // gray
        description: `Borderline - ${analysis.chanceToImprove.toFixed(0)}% chance to improve`,
      };
  }
}

// ============================================
// SHARED UTILITY FUNCTIONS
// Used across multiple components - DO NOT DUPLICATE
// ============================================

/**
 * Get remaining games for a team this week
 * Filters out games that have already been played (based on player's game log)
 *
 * @param team - NBA team abbreviation (e.g., 'LAL')
 * @param schedule - NBASchedule object with remaining games
 * @param player - PlayerAnalytics to check for already-played games
 */
export function getRemainingGames(
  team: string,
  schedule: NBASchedule | null,
  player: PlayerAnalytics
): { count: number; games: Array<{ opponent: string; home: boolean; date: string }> } {
  if (!schedule) return { count: 0, games: [] };
  const allRemaining = schedule.remainingThisWeek[team] || [];
  const currentWeek = schedule.currentWeek;

  // Get dates where player has already played this week
  const thisWeekStats = player.weeklyStats.find(w => w.week === currentWeek);
  const playedDates = new Set<string>();
  if (thisWeekStats?.gamesList) {
    thisWeekStats.gamesList.forEach(g => {
      if (g.date) playedDates.add(g.date);
    });
  }

  // Filter out games on dates the player has already played
  const futureGames = allRemaining.filter(g => !playedDates.has(g.date));

  return {
    count: futureGames.length,
    games: futureGames.map(g => ({ opponent: g.opponent, home: g.home, date: g.date })),
  };
}

/**
 * Get CSS class for trend value display
 * Used for Δ2v4, Δ4v8 trend indicators
 *
 * @param value - Percentage change value
 * @returns CSS class name for styling
 */
export function getTrendClass(value: number | null): string {
  if (value === null) return '';
  if (value >= 15) return 'trend-hot';
  if (value >= 5) return 'trend-up';
  if (value <= -15) return 'trend-cold';
  if (value <= -5) return 'trend-down';
  return 'trend-flat';
}

// ============================================
// LEGACY FUNCTIONS (kept for compatibility)
// ============================================

// Filter players by week range
export function filterByWeeks(players: PlayerAnalytics[], weeks: number[]): PlayerAnalytics[] {
  if (weeks.length === 0) return players;

  return players.map(player => {
    const filteredWeekly = player.weeklyStats.filter(w => weeks.includes(w.week));
    const filteredGames = player.games.filter(g => weeks.includes(g.week));

    if (filteredGames.length === 0) {
      return { ...player, totalGames: 0 };
    }

    const fptsValues = filteredGames.map(g => g.fpts);
    const minutesValues = filteredGames.map(g => g.minutes);
    const avgFpts = fptsValues.reduce((a, b) => a + b, 0) / fptsValues.length;
    const avgMinutes = minutesValues.reduce((a, b) => a + b, 0) / minutesValues.length;
    const weeklyMaxes = filteredWeekly.map(w => w.maxFpts);

    return {
      ...player,
      totalGames: filteredGames.length,
      weeksPlayed: filteredWeekly.length,
      avgFpts,
      avgMinutes,
      expectedLockin: weeklyMaxes.length > 0 ? weeklyMaxes.reduce((a, b) => a + b, 0) / weeklyMaxes.length : 0,
      lockinCeiling: weeklyMaxes.length > 0 ? Math.max(...weeklyMaxes) : 0,
      lockinFloor: weeklyMaxes.length > 0 ? Math.min(...weeklyMaxes) : 0,
      weeklyStats: filteredWeekly,
      games: filteredGames,
    };
  }).filter(p => p.totalGames > 0);
}

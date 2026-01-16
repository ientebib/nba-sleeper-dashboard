import type {
  Game,
  PlayerAnalytics,
  TeamAnalytics,
  Roster,
  WeeklyStats,
  PeriodStats,
  TradeAnalysis,
} from '../types';

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
  allNbaPlayers?: Record<string, { position?: string; injury_status?: string | null }>
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
    const position = rosterInfo?.position || nbaPlayerInfo?.position || 'N/A';
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

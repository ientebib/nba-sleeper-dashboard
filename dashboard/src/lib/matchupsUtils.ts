import type {
  PlayerAnalytics,
  TeamAnalytics,
  Roster,
  WeekMatchup,
  PlayerWeekLockIn,
  WeekGame,
} from '../types';
import type { NBASchedule } from './dataLoader';

// Position slot types - order matters (this is the display order)
export const POSITION_SLOTS = ['PG', 'SG', 'G', 'SF', 'PF', 'F', 'C', 'UTIL', 'UTIL', 'UTIL'] as const;
export type PositionSlot = typeof POSITION_SLOTS[number];

// Position eligibility rules - which player positions can fill which slot
export const POSITION_ELIGIBILITY: Record<PositionSlot, string[]> = {
  'PG': ['PG'],                              // Only point guards
  'SG': ['SG'],                              // Only shooting guards
  'G': ['PG', 'SG', 'G'],                    // Any guard
  'SF': ['SF'],                              // Only small forwards
  'PF': ['PF'],                              // Only power forwards
  'F': ['SF', 'PF', 'F'],                    // Any forward
  'C': ['C'],                                // Only centers
  'UTIL': ['PG', 'SG', 'G', 'SF', 'PF', 'F', 'C'],  // Any position
};

/**
 * Check if a player can fill a position slot based on their positions
 * @param playerPositions Array of positions the player has (e.g., ['C', 'PF'])
 * @param slot The position slot to check
 */
export function canFillSlot(playerPositions: string[], slot: PositionSlot): boolean {
  const eligiblePositions = POSITION_ELIGIBILITY[slot];
  return playerPositions.some(pos => eligiblePositions.includes(pos));
}

/**
 * Parse player position string into array
 * Handles formats like "C/PF", "PG/SG/SF", "G", etc.
 */
export function parsePositions(positionStr: string): string[] {
  if (!positionStr || positionStr === 'N/A') return [];
  return positionStr.split('/').map(p => p.trim().toUpperCase());
}

/**
 * Check if a game can be locked
 * Rules:
 * 1. Game must have already occurred (not future)
 * 2. If this is the last game of the week, can always lock
 * 3. Otherwise, can lock any completed game before the next game starts
 */
export function canLockGame(
  game: WeekGame,
  allGames: WeekGame[]
): { canLock: boolean; reason: string } {
  // Can't lock a game that hasn't been played
  if (!game.isPlayed) {
    return { canLock: false, reason: 'Game has not occurred yet' };
  }

  // Find future games (not played yet)
  const futureGames = allGames.filter(g => !g.isPlayed);

  // If no future games, this is last game - can always lock
  if (futureGames.length === 0) {
    return { canLock: true, reason: 'Last game of week - can lock' };
  }

  // Can lock any completed game before the next scheduled game
  // In practice, since we don't have exact game times, we allow locking
  // any completed game as long as there are future games
  return { canLock: true, reason: 'Can lock before next game' };
}

/**
 * Get the optimal game (highest scoring played game)
 */
export function getOptimalGame(games: WeekGame[]): WeekGame | null {
  const playedGames = games.filter(g => g.isPlayed && g.fpts > 0);
  if (playedGames.length === 0) return null;

  return playedGames.reduce((best, game) =>
    game.fpts > best.fpts ? game : best
  );
}

/**
 * Calculate lock quality
 */
export function calculateLockQuality(
  lockedFpts: number,
  optimalFpts: number
): 'optimal' | 'good' | 'suboptimal' | 'poor' {
  if (lockedFpts >= optimalFpts) return 'optimal';

  const difference = optimalFpts - lockedFpts;
  const percentDiff = (difference / optimalFpts) * 100;

  if (percentDiff <= 5) return 'good';       // Within 5% of optimal
  if (percentDiff <= 15) return 'suboptimal'; // 5-15% below optimal
  return 'poor';                              // More than 15% below
}

/**
 * Build a PlayerWeekLockIn from player data
 */
export function buildPlayerWeekLockIn(
  player: PlayerAnalytics,
  week: number,
  nbaSchedule: NBASchedule | null
): PlayerWeekLockIn {
  // Get this week's games from player data
  const weekStats = player.weeklyStats.find(w => w.week === week);
  const playedGames = weekStats?.gamesList || [];

  // Get scheduled remaining games from schedule
  const remainingScheduled = nbaSchedule?.remainingThisWeek[player.nba_team] || [];
  const playedDates = new Set(playedGames.map(g => g.date));

  // Build games array: played games + upcoming games
  const games: WeekGame[] = [
    // Played games
    ...playedGames.map(g => ({
      date: g.date,
      fpts: g.fpts,
      opponent: g.matchup,
      isPlayed: true,
      isLocked: false,
    })),
    // Upcoming games (not yet played)
    ...remainingScheduled
      .filter(g => !playedDates.has(g.date))
      .map(g => ({
        date: g.date,
        fpts: 0,
        opponent: g.home ? `vs ${g.opponent}` : `@ ${g.opponent}`,
        isPlayed: false,
        isLocked: false,
      })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Find optimal game
  const optimal = getOptimalGame(games);

  return {
    sleeperId: player.sleeper_id,
    playerName: player.player,
    nbaTeam: player.nba_team,
    position: player.position,
    week,
    games,
    lockedGame: null,
    optimalGame: optimal ? { date: optimal.date, fpts: optimal.fpts } : null,
    lockQuality: null,
  };
}

/**
 * Get opponent roster ID for a given week
 * This is a placeholder - in real implementation, this would come from
 * Sleeper API matchup data. For now, we'll need to pass it manually or
 * infer from rosters data structure.
 */
export function getOpponentRosterId(
  rosters: Roster[],
  myRosterId: number,
  _week: number
): number | null {
  // Simple round-robin matchup simulation
  // In reality, this should come from Sleeper matchup data
  // For now, just return a different team
  const otherTeams = rosters.filter(r => r.roster_id !== myRosterId);
  if (otherTeams.length === 0) return null;

  // Use week to cycle through opponents
  const idx = (_week - 1) % otherTeams.length;
  return otherTeams[idx].roster_id;
}

/**
 * Build a complete WeekMatchup from team data
 * If starterIds are provided, use those to order players (starters first, bench last)
 */
export function buildWeekMatchup(
  week: number,
  myTeam: TeamAnalytics,
  opponentTeam: TeamAnalytics,
  players: PlayerAnalytics[],
  nbaSchedule: NBASchedule | null,
  myStarterIds?: string[],
  opponentStarterIds?: string[],
  seasonYear: string = '2025-26'
): WeekMatchup {
  // Get players for each team
  const myTeamPlayers = players.filter(p => p.fantasy_team === myTeam.ownerName);
  const opponentTeamPlayers = players.filter(p => p.fantasy_team === opponentTeam.ownerName);

  // Order players: starters (in order) first, then bench sorted by expected lockin
  const orderPlayers = (teamPlayers: PlayerAnalytics[], starterIds?: string[]): PlayerWeekLockIn[] => {
    if (starterIds && starterIds.length > 0) {
      // Build starters in exact order
      const starters: PlayerWeekLockIn[] = [];
      const starterSet = new Set(starterIds);

      for (const id of starterIds) {
        const player = teamPlayers.find(p => p.sleeper_id === id);
        if (player) {
          starters.push(buildPlayerWeekLockIn(player, week, nbaSchedule));
        }
      }

      // Add bench players (not in starters), sorted by expected lockin
      const bench = teamPlayers
        .filter(p => !starterSet.has(p.sleeper_id))
        .sort((a, b) => b.expectedLockin - a.expectedLockin)
        .map(p => buildPlayerWeekLockIn(p, week, nbaSchedule));

      return [...starters, ...bench];
    } else {
      // Fallback: sort all by expected lockin
      return teamPlayers
        .sort((a, b) => b.expectedLockin - a.expectedLockin)
        .map(p => buildPlayerWeekLockIn(p, week, nbaSchedule));
    }
  };

  const myPlayers = orderPlayers(myTeamPlayers, myStarterIds);
  const opponentPlayers = orderPlayers(opponentTeamPlayers, opponentStarterIds);

  // Calculate optimal totals (only starters - first 10)
  const myStarters = myPlayers.slice(0, 10);
  const oppStarters = opponentPlayers.slice(0, 10);

  const myOptimalTotal = myStarters.reduce(
    (sum, p) => sum + (p.optimalGame?.fpts || 0),
    0
  );
  const opponentOptimalTotal = oppStarters.reduce(
    (sum, p) => sum + (p.optimalGame?.fpts || 0),
    0
  );

  return {
    week,
    seasonYear,
    myTeamRosterId: myTeam.rosterId,
    opponentRosterId: opponentTeam.rosterId,
    myTeamName: myTeam.teamName || myTeam.ownerName,
    opponentTeamName: opponentTeam.teamName || opponentTeam.ownerName,
    myPlayers,
    opponentPlayers,
    myTotalLocked: 0,
    opponentTotalLocked: 0,
    myOptimalTotal,
    opponentOptimalTotal,
    result: 'pending',
  };
}

/**
 * Format a date for display
 */
export function formatGameDate(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00'); // Noon to avoid timezone issues
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[date.getDay()]} ${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * Get display color for lock quality
 */
export function getLockQualityColor(
  quality: 'optimal' | 'good' | 'suboptimal' | 'poor' | null
): string {
  switch (quality) {
    case 'optimal':
      return 'var(--te-green)';
    case 'good':
      return 'var(--te-blue)';
    case 'suboptimal':
      return 'var(--te-amber)';
    case 'poor':
      return 'var(--te-red)';
    default:
      return 'var(--text-muted)';
  }
}

/**
 * Get display label for lock quality
 */
export function getLockQualityLabel(
  quality: 'optimal' | 'good' | 'suboptimal' | 'poor' | null
): string {
  switch (quality) {
    case 'optimal':
      return 'Optimal';
    case 'good':
      return 'Good';
    case 'suboptimal':
      return 'Suboptimal';
    case 'poor':
      return 'Poor';
    default:
      return 'Not Locked';
  }
}

/**
 * Sync matchup data with fresh player data
 * Updates game scores while preserving lock decisions
 */
export function syncMatchupWithPlayerData(
  matchup: WeekMatchup,
  players: PlayerAnalytics[],
  nbaSchedule: NBASchedule | null
): WeekMatchup {
  const syncPlayers = (
    lockInPlayers: PlayerWeekLockIn[],
    fantasyTeam: string
  ): PlayerWeekLockIn[] => {
    return lockInPlayers.map(lockInPlayer => {
      const playerData = players.find(
        p => p.sleeper_id === lockInPlayer.sleeperId &&
             p.fantasy_team === fantasyTeam
      );

      if (!playerData) return lockInPlayer;

      // Rebuild games from fresh data
      const fresh = buildPlayerWeekLockIn(playerData, matchup.week, nbaSchedule);

      // Preserve existing lock
      if (lockInPlayer.lockedGame) {
        const lockedDate = lockInPlayer.lockedGame.gameDate;
        fresh.games = fresh.games.map(g => ({
          ...g,
          isLocked: g.date === lockedDate,
        }));
        fresh.lockedGame = lockInPlayer.lockedGame;

        // Recalculate quality with updated optimal
        if (fresh.optimalGame && fresh.lockedGame) {
          fresh.lockQuality = calculateLockQuality(
            fresh.lockedGame.gameFpts,
            fresh.optimalGame.fpts
          );
        }
      }

      return fresh;
    });
  };

  const myPlayers = syncPlayers(matchup.myPlayers, matchup.myTeamName);
  const opponentPlayers = syncPlayers(matchup.opponentPlayers, matchup.opponentTeamName);

  return {
    ...matchup,
    myPlayers,
    opponentPlayers,
    myOptimalTotal: myPlayers.reduce((sum, p) => sum + (p.optimalGame?.fpts || 0), 0),
    opponentOptimalTotal: opponentPlayers.reduce((sum, p) => sum + (p.optimalGame?.fpts || 0), 0),
  };
}

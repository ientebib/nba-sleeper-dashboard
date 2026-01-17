import { useState, useEffect, useCallback } from 'react';
import type {
  MatchupsStorage,
  WeekMatchup,
  LockInDecision,
  PlayerWeekLockIn,
} from '../types';

const STORAGE_KEY = 'sleepr-matchups';
const CURRENT_VERSION = 1;

// Default empty storage
function getDefaultStorage(): MatchupsStorage {
  return {
    version: CURRENT_VERSION,
    config: {
      myTeamRosterId: null,
    },
    history: [],
    lastUpdated: new Date().toISOString(),
  };
}

// Migrate old storage formats to current version
function migrateStorage(data: unknown): MatchupsStorage {
  if (!data || typeof data !== 'object') {
    return getDefaultStorage();
  }

  const storage = data as MatchupsStorage;

  // Version 1 is current, no migrations needed yet
  if (storage.version === CURRENT_VERSION) {
    return storage;
  }

  // Future migrations would go here
  // if (storage.version === 1) { ... migrate to 2 ... }

  // Default: return as-is with updated version
  return {
    ...getDefaultStorage(),
    ...storage,
    version: CURRENT_VERSION,
  };
}

// Load storage from localStorage
function loadStorage(): MatchupsStorage {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return migrateStorage(parsed);
    }
  } catch (e) {
    console.error('Failed to load matchups storage:', e);
  }
  return getDefaultStorage();
}

// Save storage to localStorage
function saveStorage(storage: MatchupsStorage): void {
  try {
    const toSave: MatchupsStorage = {
      ...storage,
      lastUpdated: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (e) {
    console.error('Failed to save matchups storage:', e);
  }
}

export interface UseMatchupsStorageReturn {
  storage: MatchupsStorage;
  myTeamId: number | null;
  setMyTeam: (rosterId: number) => void;
  getMatchup: (week: number) => WeekMatchup | undefined;
  initializeWeek: (matchup: WeekMatchup) => void;
  updateMatchup: (week: number, updates: Partial<WeekMatchup>) => void;
  recordLock: (
    week: number,
    sleeperId: string,
    isMyTeam: boolean,
    decision: LockInDecision
  ) => void;
  clearLock: (week: number, sleeperId: string, isMyTeam: boolean) => void;
  updatePlayerGames: (
    week: number,
    sleeperId: string,
    isMyTeam: boolean,
    games: PlayerWeekLockIn['games']
  ) => void;
  swapPlayers: (
    week: number,
    starterIndex: number,
    benchIndex: number,
    isMyTeam: boolean
  ) => void;
  resetStorage: () => void;
  clearWeekMatchup: (week: number) => void;
}

export function useMatchupsStorage(): UseMatchupsStorageReturn {
  const [storage, setStorage] = useState<MatchupsStorage>(loadStorage);

  // Auto-save on changes
  useEffect(() => {
    saveStorage(storage);
  }, [storage]);

  // Set my team
  const setMyTeam = useCallback((rosterId: number) => {
    setStorage(prev => ({
      ...prev,
      config: { ...prev.config, myTeamRosterId: rosterId },
    }));
  }, []);

  // Get matchup for a specific week
  const getMatchup = useCallback((week: number): WeekMatchup | undefined => {
    return storage.history.find(m => m.week === week);
  }, [storage.history]);

  // Initialize a new week's matchup
  const initializeWeek = useCallback((matchup: WeekMatchup) => {
    setStorage(prev => {
      const exists = prev.history.some(m => m.week === matchup.week);
      if (exists) {
        // Update existing matchup instead of duplicating
        return {
          ...prev,
          history: prev.history.map(m =>
            m.week === matchup.week ? { ...m, ...matchup } : m
          ),
        };
      }
      return {
        ...prev,
        history: [...prev.history, matchup].sort((a, b) => b.week - a.week),
      };
    });
  }, []);

  // Update matchup data
  const updateMatchup = useCallback((week: number, updates: Partial<WeekMatchup>) => {
    setStorage(prev => ({
      ...prev,
      history: prev.history.map(m =>
        m.week === week ? { ...m, ...updates } : m
      ),
    }));
  }, []);

  // Record a lock decision
  const recordLock = useCallback((
    week: number,
    sleeperId: string,
    isMyTeam: boolean,
    decision: LockInDecision
  ) => {
    setStorage(prev => {
      const history = prev.history.map(m => {
        if (m.week !== week) return m;

        const playersKey = isMyTeam ? 'myPlayers' : 'opponentPlayers';
        const players = m[playersKey].map(p => {
          if (p.sleeperId !== sleeperId) return p;

          // Update the locked game and mark it in games array
          const updatedGames = p.games.map(g => ({
            ...g,
            isLocked: g.date === decision.gameDate,
          }));

          // Calculate optimal game (best played game)
          const playedGames = updatedGames.filter(g => g.isPlayed && g.fpts > 0);
          const optimalGame = playedGames.length > 0
            ? playedGames.reduce((best, g) => g.fpts > best.fpts ? g : best)
            : null;

          // Calculate lock quality
          let lockQuality: PlayerWeekLockIn['lockQuality'] = null;
          if (optimalGame) {
            const diff = optimalGame.fpts - decision.gameFpts;
            const pctDiff = (diff / optimalGame.fpts) * 100;
            if (diff === 0) lockQuality = 'optimal';
            else if (pctDiff <= 5) lockQuality = 'good';
            else if (pctDiff <= 15) lockQuality = 'suboptimal';
            else lockQuality = 'poor';
          }

          return {
            ...p,
            games: updatedGames,
            lockedGame: decision,
            optimalGame: optimalGame ? { date: optimalGame.date, fpts: optimalGame.fpts } : null,
            lockQuality,
          };
        });

        const updatedMatchup = {
          ...m,
          [playersKey]: players,
        };

        // Recalculate totals
        updatedMatchup.myTotalLocked = updatedMatchup.myPlayers
          .reduce((sum, p) => sum + (p.lockedGame?.gameFpts || 0), 0);
        updatedMatchup.opponentTotalLocked = updatedMatchup.opponentPlayers
          .reduce((sum, p) => sum + (p.lockedGame?.gameFpts || 0), 0);
        updatedMatchup.myOptimalTotal = updatedMatchup.myPlayers
          .reduce((sum, p) => sum + (p.optimalGame?.fpts || 0), 0);
        updatedMatchup.opponentOptimalTotal = updatedMatchup.opponentPlayers
          .reduce((sum, p) => sum + (p.optimalGame?.fpts || 0), 0);

        return updatedMatchup;
      });

      return { ...prev, history };
    });
  }, []);

  // Clear a lock decision
  const clearLock = useCallback((
    week: number,
    sleeperId: string,
    isMyTeam: boolean
  ) => {
    setStorage(prev => {
      const history = prev.history.map(m => {
        if (m.week !== week) return m;

        const playersKey = isMyTeam ? 'myPlayers' : 'opponentPlayers';
        const players = m[playersKey].map(p => {
          if (p.sleeperId !== sleeperId) return p;

          return {
            ...p,
            games: p.games.map(g => ({ ...g, isLocked: false })),
            lockedGame: null,
            lockQuality: null,
          };
        });

        const updatedMatchup = {
          ...m,
          [playersKey]: players,
        };

        // Recalculate totals
        updatedMatchup.myTotalLocked = updatedMatchup.myPlayers
          .reduce((sum, p) => sum + (p.lockedGame?.gameFpts || 0), 0);
        updatedMatchup.opponentTotalLocked = updatedMatchup.opponentPlayers
          .reduce((sum, p) => sum + (p.lockedGame?.gameFpts || 0), 0);

        return updatedMatchup;
      });

      return { ...prev, history };
    });
  }, []);

  // Update player's games (for syncing with fresh data)
  const updatePlayerGames = useCallback((
    week: number,
    sleeperId: string,
    isMyTeam: boolean,
    games: PlayerWeekLockIn['games']
  ) => {
    setStorage(prev => {
      const history = prev.history.map(m => {
        if (m.week !== week) return m;

        const playersKey = isMyTeam ? 'myPlayers' : 'opponentPlayers';
        const players = m[playersKey].map(p => {
          if (p.sleeperId !== sleeperId) return p;

          // Preserve lock status when updating games
          const lockedDate = p.lockedGame?.gameDate;
          const updatedGames = games.map(g => ({
            ...g,
            isLocked: g.date === lockedDate,
          }));

          // Recalculate optimal
          const playedGames = updatedGames.filter(g => g.isPlayed && g.fpts > 0);
          const optimalGame = playedGames.length > 0
            ? playedGames.reduce((best, g) => g.fpts > best.fpts ? g : best)
            : null;

          // Recalculate quality if locked
          let lockQuality = p.lockQuality;
          if (p.lockedGame && optimalGame) {
            const diff = optimalGame.fpts - p.lockedGame.gameFpts;
            const pctDiff = (diff / optimalGame.fpts) * 100;
            if (diff === 0) lockQuality = 'optimal';
            else if (pctDiff <= 5) lockQuality = 'good';
            else if (pctDiff <= 15) lockQuality = 'suboptimal';
            else lockQuality = 'poor';
          }

          return {
            ...p,
            games: updatedGames,
            optimalGame: optimalGame ? { date: optimalGame.date, fpts: optimalGame.fpts } : null,
            lockQuality,
          };
        });

        const updatedMatchup = {
          ...m,
          [playersKey]: players,
        };

        // Recalculate optimal totals
        updatedMatchup.myOptimalTotal = updatedMatchup.myPlayers
          .reduce((sum, p) => sum + (p.optimalGame?.fpts || 0), 0);
        updatedMatchup.opponentOptimalTotal = updatedMatchup.opponentPlayers
          .reduce((sum, p) => sum + (p.optimalGame?.fpts || 0), 0);

        return updatedMatchup;
      });

      return { ...prev, history };
    });
  }, []);

  // Reset all storage
  const resetStorage = useCallback(() => {
    setStorage(getDefaultStorage());
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Clear a specific week's matchup
  const clearWeekMatchup = useCallback((week: number) => {
    setStorage(prev => ({
      ...prev,
      history: prev.history.filter(m => m.week !== week),
    }));
  }, []);

  // Swap a starter with a bench player
  const swapPlayers = useCallback((
    week: number,
    starterIndex: number,
    benchIndex: number,
    isMyTeam: boolean
  ) => {
    setStorage(prev => {
      const history = prev.history.map(m => {
        if (m.week !== week) return m;

        const playersKey = isMyTeam ? 'myPlayers' : 'opponentPlayers';
        const players = [...m[playersKey]];

        // Validate indices
        const STARTERS_COUNT = 10;
        const actualBenchIndex = STARTERS_COUNT + benchIndex;

        if (starterIndex < 0 || starterIndex >= STARTERS_COUNT) return m;
        if (actualBenchIndex < STARTERS_COUNT || actualBenchIndex >= players.length) return m;

        // Swap the players
        const temp = players[starterIndex];
        players[starterIndex] = players[actualBenchIndex];
        players[actualBenchIndex] = temp;

        return {
          ...m,
          [playersKey]: players,
        };
      });

      return { ...prev, history };
    });
  }, []);

  return {
    storage,
    myTeamId: storage.config.myTeamRosterId,
    setMyTeam,
    getMatchup,
    initializeWeek,
    updateMatchup,
    recordLock,
    clearLock,
    updatePlayerGames,
    swapPlayers,
    resetStorage,
    clearWeekMatchup,
  };
}

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Target,
  Settings,
  History,
  RefreshCw,
  Lock,
  RotateCcw,
} from 'lucide-react';
import type { PlayerAnalytics, TeamAnalytics, Roster } from '../../types';
import type { NBASchedule, SleeperMatchups } from '../../lib/dataLoader';
import { findOpponentForWeek } from '../../lib/dataLoader';
import { useMatchupsStorage } from '../../hooks/useMatchupsStorage';
import {
  buildWeekMatchup,
  syncMatchupWithPlayerData,
} from '../../lib/matchupsUtils';
import MyTeamSelector from './MyTeamSelector';
import WeeklyMatchupView from './WeeklyMatchupView';
import './Matchups.css';

interface Props {
  teams: TeamAnalytics[];
  players: PlayerAnalytics[];
  rosters: Roster[];
  nbaSchedule: NBASchedule | null;
  sleeperMatchups: SleeperMatchups | null;
  onPlayerSelect: (player: PlayerAnalytics) => void;
}

export default function Matchups({
  teams,
  players,
  rosters: _rosters,
  nbaSchedule,
  sleeperMatchups,
  onPlayerSelect,
}: Props) {
  const {
    storage,
    myTeamId,
    setMyTeam,
    getMatchup,
    initializeWeek,
    recordLock,
    clearLock,
    swapPlayers,
    resetStorage: _resetStorage,
    clearWeekMatchup,
  } = useMatchupsStorage();

  const [showTeamSelector, setShowTeamSelector] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Get current week from schedule
  const currentWeek = nbaSchedule?.currentWeek || 1;

  // Set selected week to current if not set
  useEffect(() => {
    if (selectedWeek === null) {
      setSelectedWeek(currentWeek);
    }
  }, [currentWeek, selectedWeek]);

  // Get my team
  const myTeam = useMemo(() => {
    if (!myTeamId) return null;
    return teams.find(t => t.rosterId === myTeamId) || null;
  }, [teams, myTeamId]);

  // Get opponent from actual Sleeper matchup data
  const matchupInfo = useMemo(() => {
    if (!myTeamId || !selectedWeek) return null;
    return findOpponentForWeek(sleeperMatchups, myTeamId, selectedWeek);
  }, [sleeperMatchups, myTeamId, selectedWeek]);

  const opponentTeam = useMemo(() => {
    if (!matchupInfo) return null;
    return teams.find(t => t.rosterId === matchupInfo.opponentRosterId) || null;
  }, [teams, matchupInfo]);

  // Initialize or sync current week matchup
  useEffect(() => {
    if (!myTeam || !opponentTeam || !selectedWeek || !matchupInfo) return;

    const existingMatchup = getMatchup(selectedWeek);

    if (!existingMatchup) {
      // Create new matchup with actual starters from Sleeper
      const newMatchup = buildWeekMatchup(
        selectedWeek,
        myTeam,
        opponentTeam,
        players,
        nbaSchedule,
        matchupInfo.myStarters,
        matchupInfo.opponentStarters
      );
      initializeWeek(newMatchup);
    } else {
      // Sync existing matchup with fresh data
      const synced = syncMatchupWithPlayerData(existingMatchup, players, nbaSchedule);
      if (JSON.stringify(synced) !== JSON.stringify(existingMatchup)) {
        initializeWeek(synced);
      }
    }
  }, [myTeam, opponentTeam, selectedWeek, players, nbaSchedule, matchupInfo, getMatchup, initializeWeek]);

  // Get the current matchup data
  const currentMatchup = selectedWeek ? getMatchup(selectedWeek) : null;

  // Get historical weeks
  const historicalWeeks = useMemo(() => {
    return storage.history
      .filter(m => m.week !== currentWeek)
      .sort((a, b) => b.week - a.week);
  }, [storage.history, currentWeek]);

  // Handle lock action
  const handleLock = (
    sleeperId: string,
    isMyTeam: boolean,
    gameDate: string,
    gameFpts: number
  ) => {
    if (!selectedWeek) return;

    recordLock(selectedWeek, sleeperId, isMyTeam, {
      gameDate,
      gameFpts,
      lockedAt: new Date().toISOString(),
      isAutoLocked: false,
    });
  };

  // Handle clear lock
  const handleClearLock = (sleeperId: string, isMyTeam: boolean) => {
    if (!selectedWeek) return;
    clearLock(selectedWeek, sleeperId, isMyTeam);
  };

  // Handle swap between starter and bench
  const handleSwap = (starterIndex: number, benchIndex: number, isMyTeam: boolean) => {
    if (!selectedWeek) return;
    swapPlayers(selectedWeek, starterIndex, benchIndex, isMyTeam);
  };

  // Calculate starters-only totals
  const startersOnlyTotals = useMemo(() => {
    if (!currentMatchup) return { myLocked: 0, myOptimal: 0, oppLocked: 0, oppOptimal: 0 };

    // Only count first 10 players (starters)
    const myStarters = currentMatchup.myPlayers.slice(0, 10);
    const oppStarters = currentMatchup.opponentPlayers.slice(0, 10);

    return {
      myLocked: myStarters.reduce((sum, p) => sum + (p.lockedGame?.gameFpts || 0), 0),
      myOptimal: myStarters.reduce((sum, p) => sum + (p.optimalGame?.fpts || 0), 0),
      oppLocked: oppStarters.reduce((sum, p) => sum + (p.lockedGame?.gameFpts || 0), 0),
      oppOptimal: oppStarters.reduce((sum, p) => sum + (p.optimalGame?.fpts || 0), 0),
    };
  }, [currentMatchup]);

  // Show team selector if no team selected
  if (!myTeamId) {
    return (
      <motion.div
        className="matchups-container"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="matchups-header">
          <div className="header-title">
            <Target size={24} />
            <h2>Matchups</h2>
          </div>
        </div>

        <MyTeamSelector
          teams={teams}
          onSelect={(rosterId) => {
            setMyTeam(rosterId);
            setShowTeamSelector(false);
          }}
        />
      </motion.div>
    );
  }

  return (
    <motion.div
      className="matchups-container"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Header */}
      <div className="matchups-header">
        <div className="header-title">
          <Target size={24} />
          <h2>Matchups</h2>
        </div>

        <div className="header-controls">
          {/* Week Selector */}
          <div className="week-selector">
            <select
              value={selectedWeek || currentWeek}
              onChange={e => setSelectedWeek(Number(e.target.value))}
              className="week-dropdown"
            >
              {Array.from({ length: currentWeek }, (_, i) => i + 1)
                .reverse()
                .map(week => (
                  <option key={week} value={week}>
                    Week {week} {week === currentWeek ? '(Current)' : ''}
                  </option>
                ))}
            </select>
          </div>

          {/* History Toggle */}
          <button
            className={`btn btn-ghost ${showHistory ? 'active' : ''}`}
            onClick={() => setShowHistory(!showHistory)}
          >
            <History size={16} />
            History
          </button>

          {/* Refresh Week Data */}
          <button
            className="btn btn-ghost"
            onClick={() => {
              if (selectedWeek) {
                clearWeekMatchup(selectedWeek);
              }
            }}
            title="Refresh this week's data"
          >
            <RotateCcw size={16} />
          </button>

          {/* Settings */}
          <button
            className="btn btn-ghost"
            onClick={() => setShowTeamSelector(true)}
            title="Change team"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      {/* Team Selector Modal */}
      {showTeamSelector && (
        <div className="modal-overlay" onClick={() => setShowTeamSelector(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <MyTeamSelector
              teams={teams}
              currentTeamId={myTeamId}
              onSelect={(rosterId) => {
                setMyTeam(rosterId);
                setShowTeamSelector(false);
              }}
              onCancel={() => setShowTeamSelector(false)}
            />
          </div>
        </div>
      )}

      {/* Matchup Summary - Compact */}
      {currentMatchup && myTeam && opponentTeam && (
        <div className="matchup-summary compact">
          <div className="team-summary my-team">
            <div className="team-name">{currentMatchup.myTeamName}</div>
            <div className="team-record">{myTeam.record}</div>
            <div className="team-scores">
              <div className="locked-score">
                <Lock size={12} />
                <span className="value">{startersOnlyTotals.myLocked.toFixed(1)}</span>
              </div>
              <div className="optimal-score">
                <span className="label">opt</span>
                <span className="value">{startersOnlyTotals.myOptimal.toFixed(1)}</span>
              </div>
            </div>
          </div>

          <div className="vs-badge">VS</div>

          <div className="team-summary opponent-team">
            <div className="team-name">{currentMatchup.opponentTeamName}</div>
            <div className="team-record">{opponentTeam.record}</div>
            <div className="team-scores">
              <div className="locked-score">
                <Lock size={12} />
                <span className="value">{startersOnlyTotals.oppLocked.toFixed(1)}</span>
              </div>
              <div className="optimal-score">
                <span className="label">opt</span>
                <span className="value">{startersOnlyTotals.oppOptimal.toFixed(1)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Current Week View */}
      {currentMatchup && (
        <WeeklyMatchupView
          matchup={currentMatchup}
          isCurrentWeek={selectedWeek === currentWeek}
          onLock={handleLock}
          onClearLock={handleClearLock}
          onSwap={handleSwap}
          onPlayerSelect={onPlayerSelect}
          players={players}
        />
      )}

      {/* History Section */}
      {showHistory && historicalWeeks.length > 0 && (
        <div className="history-section">
          <h3>
            <History size={18} />
            Past Matchups
          </h3>
          {historicalWeeks.map(matchup => (
            <div key={matchup.week} className="history-item">
              <div className="history-header">
                <span className="week-label">Week {matchup.week}</span>
                <span className="matchup-result">
                  {matchup.myTotalLocked.toFixed(1)} - {matchup.opponentTotalLocked.toFixed(1)}
                </span>
                <span className={`result-badge ${matchup.result || 'pending'}`}>
                  {matchup.result === 'win' ? 'W' : matchup.result === 'loss' ? 'L' : '—'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {!currentMatchup && myTeamId && (
        <div className="loading-matchup">
          <RefreshCw size={24} className="spin" />
          <p>Loading matchup data...</p>
        </div>
      )}
    </motion.div>
  );
}

import { useState } from 'react';
import { Lock, ArrowUpDown, Check, X } from 'lucide-react';
import type { PlayerWeekLockIn } from '../../types';

interface Props {
  playerLock: PlayerWeekLockIn;
  isMyTeam: boolean;
  isCurrentWeek: boolean;
  isBench?: boolean;
  slotType?: string; // Position slot type (PG, SG, G, SF, PF, F, C, UTIL)
  index?: number;
  isSwapSource?: boolean;
  isSwapTarget?: boolean;
  isSwapIneligible?: boolean; // True when in swap mode but player can't fill the slot
  onStartSwap?: () => void;
  onCompleteSwap?: () => void;
  onLock: (gameDate: string, gameFpts: number) => void;
  onClearLock: () => void;
  onPlayerClick: () => void;
}

// Format date as short day abbreviation (Mon, Tue, etc)
function formatShortDate(dateStr: string): string {
  try {
    const date = new Date(dateStr + 'T12:00:00');
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    return days[date.getDay()];
  } catch {
    return '???';
  }
}

// Get position color class - uses first position for color
function getPositionClass(position: string): string {
  const pos = position?.toUpperCase() || '';
  // Split by / and use first position for color
  const firstPos = pos.split('/')[0];
  if (firstPos === 'PG') return 'pg';
  if (firstPos === 'SG') return 'sg';
  if (firstPos === 'SF') return 'sf';
  if (firstPos === 'PF') return 'pf';
  if (firstPos === 'G') return 'g';
  if (firstPos === 'F') return 'f';
  if (firstPos === 'C') return 'c';
  return 'util';
}

export default function PlayerLockRow({
  playerLock,
  isMyTeam,
  isBench = false,
  slotType,
  isSwapSource = false,
  isSwapTarget = false,
  isSwapIneligible = false,
  onStartSwap,
  onCompleteSwap,
  onLock,
  onClearLock,
  onPlayerClick,
}: Props) {
  const { games, lockedGame, playerName, nbaTeam, position } = playerLock;

  // Determine what to display in position badge
  // For starters: show the slot type (PG, SG, G, SF, PF, F, C, UTIL)
  // For bench: show the player's actual positions or "BN"
  const displayPosition = slotType || position || 'BN';
  const [selectedGame, setSelectedGame] = useState<string | null>(null);

  // Check if player has any games this week
  const hasGames = games.length > 0;

  // Handle click on a game score - select it for potential locking
  const handleGameClick = (game: typeof games[0]) => {
    if (!game.isPlayed) return;

    // If clicking already selected game, deselect
    if (selectedGame === game.date) {
      setSelectedGame(null);
      return;
    }

    // If this game is locked, unlock it
    if (game.isLocked) {
      onClearLock();
      return;
    }

    // Select this game
    setSelectedGame(game.date);
  };

  // Confirm lock for selected game
  const handleConfirmLock = () => {
    const game = games.find(g => g.date === selectedGame);
    if (game) {
      onLock(game.date, game.fpts);
      setSelectedGame(null);
    }
  };

  // Cancel selection
  const handleCancel = () => {
    setSelectedGame(null);
  };

  const selectedGameData = selectedGame ? games.find(g => g.date === selectedGame) : null;

  return (
    <div className={`player-row ${isBench ? 'bench' : ''} ${lockedGame ? 'has-lock' : ''} ${isSwapSource ? 'swap-source' : ''} ${isSwapTarget ? 'swap-target' : ''} ${isSwapIneligible ? 'swap-ineligible' : ''} ${selectedGame ? 'selecting' : ''}`}>
      {/* Swap button for my team starters */}
      {isMyTeam && !isBench && onStartSwap && (
        <button
          className={`swap-btn ${isSwapSource ? 'active' : ''}`}
          onClick={onStartSwap}
          title="Swap with bench player"
        >
          <ArrowUpDown size={12} />
        </button>
      )}

      {/* Swap target button for bench players */}
      {isMyTeam && isBench && isSwapTarget && onCompleteSwap && (
        <button
          className="swap-btn target"
          onClick={onCompleteSwap}
          title="Swap into starting lineup"
        >
          <ArrowUpDown size={12} />
        </button>
      )}

      {/* Position Badge - shows slot type for starters, actual position for bench */}
      <div className={`position-badge ${getPositionClass(displayPosition)}`}>
        {displayPosition || '?'}
      </div>

      {/* Player Info */}
      <div className="player-info" onClick={onPlayerClick}>
        <span className="player-name">{playerName}</span>
        <span className="player-team">{nbaTeam}</span>
      </div>

      {/* Games - Clickable scores */}
      <div className="games-row">
        {hasGames ? (
          games.map(game => {
            const isLocked = game.isLocked;
            const isSelected = selectedGame === game.date;
            const isClickable = game.isPlayed;

            return (
              <button
                key={game.date}
                className={`game-score-btn ${game.isPlayed ? 'played' : 'upcoming'} ${isLocked ? 'locked' : ''} ${isClickable ? 'clickable' : ''} ${isSelected ? 'selected' : ''}`}
                onClick={() => handleGameClick(game)}
                disabled={!isClickable}
                title={isLocked ? 'Click to unlock' : game.isPlayed ? 'Click to select' : game.opponent}
              >
                <span className="score-day">{formatShortDate(game.date)}</span>
                <span className="score-value">
                  {game.isPlayed ? game.fpts.toFixed(1) : '—'}
                </span>
                {isLocked && (
                  <span className="lock-badge">
                    <Lock size={8} />
                  </span>
                )}
              </button>
            );
          })
        ) : (
          <span className="no-games-label">No games</span>
        )}
      </div>

      {/* Lock Action Area */}
      <div className="lock-action-area">
        {selectedGameData && !lockedGame ? (
          <div className="lock-confirm-inline">
            <button className="lock-btn confirm" onClick={handleConfirmLock}>
              <Lock size={12} />
              Lock {selectedGameData.fpts.toFixed(1)}
            </button>
            <button className="lock-btn cancel" onClick={handleCancel}>
              <X size={12} />
            </button>
          </div>
        ) : lockedGame ? (
          <div className="locked-value">
            <Lock size={10} />
            <span>{lockedGame.gameFpts.toFixed(1)}</span>
          </div>
        ) : games.filter(g => g.isPlayed).length > 0 ? (
          <div className="unlocked-hint">
            Select score
          </div>
        ) : (
          <div className="waiting-hint">
            {games.filter(g => !g.isPlayed).length} upcoming
          </div>
        )}
      </div>
    </div>
  );
}

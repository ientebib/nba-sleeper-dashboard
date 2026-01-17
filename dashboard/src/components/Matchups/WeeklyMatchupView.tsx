import { useState } from 'react';
import { ChevronDown, ChevronUp, Users, ArrowUpDown } from 'lucide-react';
import type { WeekMatchup, PlayerAnalytics } from '../../types';
import { POSITION_SLOTS, canFillSlot, parsePositions, type PositionSlot } from '../../lib/matchupsUtils';
import PlayerLockRow from './PlayerLockRow';

interface Props {
  matchup: WeekMatchup;
  isCurrentWeek: boolean;
  onLock: (sleeperId: string, isMyTeam: boolean, gameDate: string, gameFpts: number) => void;
  onClearLock: (sleeperId: string, isMyTeam: boolean) => void;
  onSwap: (starterIndex: number, benchIndex: number, isMyTeam: boolean) => void;
  onPlayerSelect: (player: PlayerAnalytics) => void;
  players: PlayerAnalytics[];
}

const STARTERS_COUNT = 10;

export default function WeeklyMatchupView({
  matchup,
  isCurrentWeek,
  onLock,
  onClearLock,
  onSwap,
  onPlayerSelect,
  players,
}: Props) {
  const [showMyBench, setShowMyBench] = useState(false);
  const [showOpponentBench, setShowOpponentBench] = useState(false);
  const [swapMode, setSwapMode] = useState<{ isMyTeam: boolean; starterIndex: number } | null>(null);

  // Split into starters and bench
  const myStarters = matchup.myPlayers.slice(0, STARTERS_COUNT);
  const myBench = matchup.myPlayers.slice(STARTERS_COUNT);
  const opponentStarters = matchup.opponentPlayers.slice(0, STARTERS_COUNT);
  const opponentBench = matchup.opponentPlayers.slice(STARTERS_COUNT);

  // Find full player data for navigation
  const findPlayer = (sleeperId: string): PlayerAnalytics | undefined => {
    return players.find(p => p.sleeper_id === sleeperId);
  };

  // Handle starting a swap from a starter (or canceling if same player clicked again)
  const handleStartSwap = (starterIndex: number, isMyTeam: boolean) => {
    // Only allow swapping for my team
    if (!isMyTeam) return;

    // If clicking the same player again, cancel swap mode
    if (swapMode?.isMyTeam === isMyTeam && swapMode?.starterIndex === starterIndex) {
      setSwapMode(null);
      return;
    }

    // Auto-expand bench when starting swap
    if (isMyTeam) setShowMyBench(true);

    setSwapMode({ isMyTeam, starterIndex });
  };

  // Handle completing a swap with a bench player
  const handleCompleteSwap = (benchIndex: number, isMyTeam: boolean) => {
    if (!swapMode || swapMode.isMyTeam !== isMyTeam) return;
    onSwap(swapMode.starterIndex, benchIndex, isMyTeam);
    setSwapMode(null);
  };

  // Cancel swap mode
  const handleCancelSwap = () => {
    setSwapMode(null);
  };

  return (
    <div className="weekly-matchup-view">
      {/* Swap mode banner */}
      {swapMode && (
        <div className="swap-mode-banner">
          <ArrowUpDown size={16} />
          <span>Select an eligible player for the <strong>{POSITION_SLOTS[swapMode.starterIndex]}</strong> slot</span>
          <button onClick={handleCancelSwap} className="cancel-swap-btn">Cancel</button>
        </div>
      )}

      <div className="matchup-columns">
        {/* My Team Column */}
        <div className="team-column my-team">
          <div className="column-header">
            <Users size={14} />
            <span>My Team</span>
            <span className="starters-badge">{STARTERS_COUNT} starters</span>
          </div>

          <div className="players-list">
            {myStarters.map((playerLock, index) => {
              // Don't allow swapping if player is locked
              const canSwap = !playerLock.lockedGame;

              return (
                <PlayerLockRow
                  key={`${POSITION_SLOTS[index]}-${index}-${playerLock.sleeperId}`}
                  playerLock={playerLock}
                  isMyTeam={true}
                  isCurrentWeek={isCurrentWeek}
                  slotType={POSITION_SLOTS[index]}
                  index={index}
                  isSwapSource={swapMode?.isMyTeam === true && swapMode?.starterIndex === index}
                  onStartSwap={canSwap ? () => handleStartSwap(index, true) : undefined}
                  onLock={(gameDate, gameFpts) =>
                    onLock(playerLock.sleeperId, true, gameDate, gameFpts)
                  }
                  onClearLock={() => onClearLock(playerLock.sleeperId, true)}
                  onPlayerClick={() => {
                    const player = findPlayer(playerLock.sleeperId);
                    if (player) onPlayerSelect(player);
                  }}
                />
              );
            })}
          </div>

          {/* My Bench */}
          {myBench.length > 0 && (
            <div className="bench-section">
              <button
                className="bench-toggle"
                onClick={() => setShowMyBench(!showMyBench)}
              >
                {showMyBench ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                Bench ({myBench.length})
              </button>

              {showMyBench && (
                <div className="players-list bench">
                  {myBench.map((playerLock, index) => {
                    // Check if this bench player can fill the target slot
                    const targetSlot = swapMode?.isMyTeam === true
                      ? POSITION_SLOTS[swapMode.starterIndex] as PositionSlot
                      : null;
                    const playerPositions = parsePositions(playerLock.position);
                    const isLocked = !!playerLock.lockedGame;
                    // Can only swap if: position eligible AND not locked
                    const canSwapIntoSlot = targetSlot && !isLocked
                      ? canFillSlot(playerPositions, targetSlot)
                      : false;

                    return (
                      <PlayerLockRow
                        key={playerLock.sleeperId}
                        playerLock={playerLock}
                        isMyTeam={true}
                        isCurrentWeek={isCurrentWeek}
                        isBench={true}
                        index={index}
                        isSwapTarget={swapMode?.isMyTeam === true && canSwapIntoSlot}
                        isSwapIneligible={swapMode?.isMyTeam === true && !canSwapIntoSlot}
                        onCompleteSwap={() => handleCompleteSwap(index, true)}
                        onLock={(gameDate, gameFpts) =>
                          onLock(playerLock.sleeperId, true, gameDate, gameFpts)
                        }
                        onClearLock={() => onClearLock(playerLock.sleeperId, true)}
                        onPlayerClick={() => {
                          const player = findPlayer(playerLock.sleeperId);
                          if (player) onPlayerSelect(player);
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Opponent Team Column */}
        <div className="team-column opponent-team">
          <div className="column-header">
            <Users size={14} />
            <span>Opponent</span>
            <span className="starters-badge">{STARTERS_COUNT} starters</span>
          </div>

          <div className="players-list">
            {opponentStarters.map((playerLock, index) => (
              <PlayerLockRow
                key={`${POSITION_SLOTS[index]}-${index}-${playerLock.sleeperId}`}
                playerLock={playerLock}
                isMyTeam={false}
                isCurrentWeek={isCurrentWeek}
                slotType={POSITION_SLOTS[index]}
                index={index}
                onLock={(gameDate, gameFpts) =>
                  onLock(playerLock.sleeperId, false, gameDate, gameFpts)
                }
                onClearLock={() => onClearLock(playerLock.sleeperId, false)}
                onPlayerClick={() => {
                  const player = findPlayer(playerLock.sleeperId);
                  if (player) onPlayerSelect(player);
                }}
              />
            ))}
          </div>

          {/* Opponent Bench */}
          {opponentBench.length > 0 && (
            <div className="bench-section">
              <button
                className="bench-toggle"
                onClick={() => setShowOpponentBench(!showOpponentBench)}
              >
                {showOpponentBench ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                Bench ({opponentBench.length})
              </button>

              {showOpponentBench && (
                <div className="players-list bench">
                  {opponentBench.map((playerLock, index) => (
                    <PlayerLockRow
                      key={playerLock.sleeperId}
                      playerLock={playerLock}
                      isMyTeam={false}
                      isCurrentWeek={isCurrentWeek}
                      isBench={true}
                      index={index}
                      onLock={(gameDate, gameFpts) =>
                        onLock(playerLock.sleeperId, false, gameDate, gameFpts)
                      }
                      onClearLock={() => onClearLock(playerLock.sleeperId, false)}
                      onPlayerClick={() => {
                        const player = findPlayer(playerLock.sleeperId);
                        if (player) onPlayerSelect(player);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

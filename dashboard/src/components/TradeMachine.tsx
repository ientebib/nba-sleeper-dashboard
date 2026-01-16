import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Check,
  X,
  Scale,
  Plus,
  Calendar,
  Info,
  Zap,
  AlertCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Cell,
  Legend,
} from 'recharts';
import type { PlayerAnalytics, TeamAnalytics } from '../types';
import './TradeMachine.css';

interface Props {
  players: PlayerAnalytics[];
  teams: TeamAnalytics[];
}

interface TradeSide {
  team: string;
  players: PlayerAnalytics[];
  streamerCount: number; // Number of streamer slots added
}

type TimePeriod = 'all' | 'L3W' | 'L4W' | 'L5W' | 'L6W' | 'L8W';

const TIME_PERIODS: { value: TimePeriod; label: string; weeks: number }[] = [
  { value: 'all', label: 'Season', weeks: 99 },
  { value: 'L3W', label: '3W', weeks: 3 },
  { value: 'L4W', label: '4W', weeks: 4 },
  { value: 'L5W', label: '5W', weeks: 5 },
  { value: 'L6W', label: '6W', weeks: 6 },
  { value: 'L8W', label: '8W', weeks: 8 },
];

// Calculate stats for a player filtered by weeks
function calcPlayerStats(player: PlayerAnalytics, maxWeeks: number) {
  const currentWeek = Math.max(...player.weeklyStats.map(w => w.week));
  const minWeek = maxWeeks === 99 ? 1 : currentWeek - maxWeeks + 1;

  const filteredWeeks = player.weeklyStats.filter(w => w.week >= minWeek);

  if (filteredWeeks.length === 0) {
    return {
      expectedLockin: 0,
      avgFpts: 0,
      ceiling: 0,
      floor: 0,
      games: 0,
      weeks: 0,
      avgMinutes: 0,
    };
  }

  const maxFptsList = filteredWeeks.map(w => w.maxFpts);
  const avgFptsList = filteredWeeks.map(w => w.avgFpts);
  const minutesList = filteredWeeks.map(w => w.avgMinutes);

  return {
    expectedLockin: maxFptsList.reduce((a, b) => a + b, 0) / maxFptsList.length,
    avgFpts: avgFptsList.reduce((a, b) => a + b, 0) / avgFptsList.length,
    ceiling: Math.max(...maxFptsList),
    floor: Math.min(...maxFptsList),
    games: filteredWeeks.reduce((sum, w) => sum + w.games, 0),
    weeks: filteredWeeks.length,
    avgMinutes: minutesList.reduce((a, b) => a + b, 0) / minutesList.length,
  };
}

type StreamingOption = 'top1' | 'top3' | 'top5' | 'bottom25';

const STREAMING_OPTIONS: { value: StreamingOption; label: string }[] = [
  { value: 'top1', label: 'Top FA' },
  { value: 'top3', label: 'Top 3 FA Avg' },
  { value: 'top5', label: 'Top 5 FA Avg' },
  { value: 'bottom25', label: 'Streaming Line' },
];

export default function TradeMachine({ players, teams }: Props) {
  const [side1, setSide1] = useState<TradeSide>({ team: '', players: [], streamerCount: 0 });
  const [side2, setSide2] = useState<TradeSide>({ team: '', players: [], streamerCount: 0 });
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('L4W');
  const [includeStreaming, setIncludeStreaming] = useState(true);
  const [streamingOption, setStreamingOption] = useState<StreamingOption>('top3');

  const periodConfig = TIME_PERIODS.find(p => p.value === timePeriod)!;

  // Get rostered player IDs
  const rosteredIds = useMemo(() => {
    return new Set(teams.flatMap(t => t.players.map(p => p.sleeper_id)));
  }, [teams]);

  // Get top free agents sorted by expected lock-in
  const topFreeAgents = useMemo(() => {
    return players
      .filter(p => !rosteredIds.has(p.sleeper_id))
      .map(p => ({
        player: p,
        stats: calcPlayerStats(p, periodConfig.weeks),
      }))
      .filter(p => p.stats.expectedLockin > 0)
      .sort((a, b) => b.stats.expectedLockin - a.stats.expectedLockin)
      .slice(0, 10); // Top 10 free agents
  }, [players, rosteredIds, periodConfig.weeks]);

  // Calculate streaming value based on selected option
  const streamingValue = useMemo(() => {
    if (streamingOption === 'bottom25') {
      // Original logic - bottom 25% of rostered players
      const allPlayerStats = players
        .filter(p => rosteredIds.has(p.sleeper_id))
        .map(p => calcPlayerStats(p, periodConfig.weeks))
        .filter(s => s.expectedLockin > 0);

      const sortedByLockin = [...allPlayerStats].sort((a, b) => a.expectedLockin - b.expectedLockin);
      const bottom25 = sortedByLockin.slice(0, Math.floor(sortedByLockin.length * 0.25));

      if (bottom25.length === 0) return 25;
      return bottom25.reduce((sum, p) => sum + p.expectedLockin, 0) / bottom25.length;
    }

    // Use top free agents
    if (topFreeAgents.length === 0) return 25;

    const count = streamingOption === 'top1' ? 1 : streamingOption === 'top3' ? 3 : 5;
    const topN = topFreeAgents.slice(0, count);

    return topN.reduce((sum, p) => sum + p.stats.expectedLockin, 0) / topN.length;
  }, [players, rosteredIds, topFreeAgents, streamingOption, periodConfig.weeks]);

  // Get players for a specific team, sorted by expected lock-in for the period
  const getTeamPlayers = (teamName: string) => {
    return players
      .filter(p => p.fantasy_team === teamName)
      .map(p => ({
        ...p,
        periodStats: calcPlayerStats(p, periodConfig.weeks),
      }))
      .sort((a, b) => b.periodStats.expectedLockin - a.periodStats.expectedLockin);
  };

  // Calculate totals for a side with period filtering (includes streamer value)
  const calculateTotals = (tradeSide: TradeSide) => {
    const playerStats = tradeSide.players.map(p => calcPlayerStats(p, periodConfig.weeks));
    const playerLockin = playerStats.reduce((sum, s) => sum + s.expectedLockin, 0);
    const streamerLockin = tradeSide.streamerCount * streamingValue;

    return {
      lockin: playerLockin,
      streamerLockin,
      totalLockin: playerLockin + streamerLockin,
      avg: playerStats.reduce((sum, s) => sum + s.avgFpts, 0),
      ceiling: playerStats.reduce((sum, s) => sum + s.ceiling, 0),
      floor: playerStats.reduce((sum, s) => sum + s.floor, 0),
      avgMinutes: playerStats.reduce((sum, s) => sum + s.avgMinutes, 0),
      players: tradeSide.players.length,
      streamers: tradeSide.streamerCount,
    };
  };

  const totals1 = useMemo(() => calculateTotals(side1), [side1, timePeriod, streamingValue]);
  const totals2 = useMemo(() => calculateTotals(side2), [side2, timePeriod, streamingValue]);

  // Get per-player stats for display
  const getPlayerPeriodStats = (player: PlayerAnalytics) => {
    return calcPlayerStats(player, periodConfig.weeks);
  };

  // Add/remove streamer for a side
  const addStreamer = (side: 1 | 2) => {
    if (side === 1) {
      setSide1(prev => ({ ...prev, streamerCount: prev.streamerCount + 1 }));
    } else {
      setSide2(prev => ({ ...prev, streamerCount: prev.streamerCount + 1 }));
    }
  };

  const removeStreamer = (side: 1 | 2) => {
    if (side === 1) {
      setSide1(prev => ({ ...prev, streamerCount: Math.max(0, prev.streamerCount - 1) }));
    } else {
      setSide2(prev => ({ ...prev, streamerCount: Math.max(0, prev.streamerCount - 1) }));
    }
  };

  // Trade analysis with CORRECT roster spot accounting
  // Key insight: When you receive MORE players than you give, you LOSE roster spots (cost)
  //              When you give MORE players than you receive, you GAIN roster spots (benefit)
  const analysis = useMemo(() => {
    if (side1.players.length === 0 || side2.players.length === 0) return null;

    const givingCount = side1.players.length + side1.streamerCount;
    const receivingCount = side2.players.length + side2.streamerCount;
    const rosterSpotDiff = givingCount - receivingCount; // positive = gaining spots, negative = losing spots

    // What Side A is giving up (players they lose)
    const sideAGivesPlayers = totals1.lockin;
    const sideAGivesStreamers = totals1.streamerLockin;

    // What Side A receives (players they gain)
    const sideAReceivesPlayers = totals2.lockin;
    const sideAReceivesStreamers = totals2.streamerLockin;

    // Roster spot adjustment:
    // If giving 2, receiving 1: you GAIN 1 roster spot = +streamingValue
    // If giving 1, receiving 2: you LOSE 1 roster spot = -streamingValue (opportunity cost)
    let rosterSpotAdjustment = 0;
    if (includeStreaming && rosterSpotDiff !== 0) {
      rosterSpotAdjustment = rosterSpotDiff * streamingValue;
    }

    // Total value calculation for Side A:
    // What you GET = players received + streamers on receive side + roster spots gained (if any)
    // What you LOSE = players given + streamers on give side + roster spots lost (if any)
    const totalReceived = sideAReceivesPlayers + sideAReceivesStreamers + Math.max(0, rosterSpotAdjustment);
    const totalGiven = sideAGivesPlayers + sideAGivesStreamers + Math.max(0, -rosterSpotAdjustment);

    const sideANet = totalReceived - totalGiven;

    let recommendation: 'FAVOR_1' | 'FAVOR_2' | 'EVEN' = 'EVEN';
    if (sideANet > 3) recommendation = 'FAVOR_1';
    else if (sideANet < -3) recommendation = 'FAVOR_2';

    // Compare trends
    const side1Trends = side1.players.map(p => {
      const recent = calcPlayerStats(p, 3);
      const earlier = calcPlayerStats(p, 99);
      return recent.expectedLockin - earlier.expectedLockin;
    });
    const side2Trends = side2.players.map(p => {
      const recent = calcPlayerStats(p, 3);
      const earlier = calcPlayerStats(p, 99);
      return recent.expectedLockin - earlier.expectedLockin;
    });

    const avgTrend1 = side1Trends.length > 0 ? side1Trends.reduce((a, b) => a + b, 0) / side1Trends.length : 0;
    const avgTrend2 = side2Trends.length > 0 ? side2Trends.reduce((a, b) => a + b, 0) / side2Trends.length : 0;

    return {
      sideANet,
      totalReceived,
      totalGiven,
      sideAGivesPlayers,
      sideAReceivesPlayers,
      rosterSpotDiff,
      rosterSpotAdjustment,
      recommendation,
      avgTrend1,
      avgTrend2,
    };
  }, [totals1, totals2, side1, side2, streamingValue, includeStreaming]);

  // Get weekly comparison data for chart
  const getWeeklyComparison = () => {
    const currentWeek = Math.max(
      ...players.flatMap(p => p.weeklyStats.map(w => w.week))
    );
    const startWeek = periodConfig.weeks === 99 ? 1 : currentWeek - periodConfig.weeks + 1;

    const weeks: { week: string; side1: number; side2: number }[] = [];

    for (let w = Math.max(1, startWeek); w <= currentWeek; w++) {
      let side1Total = 0;
      let side2Total = 0;

      for (const p of side1.players) {
        const weekData = p.weeklyStats.find(ws => ws.week === w);
        if (weekData) side1Total += weekData.maxFpts;
      }

      for (const p of side2.players) {
        const weekData = p.weeklyStats.find(ws => ws.week === w);
        if (weekData) side2Total += weekData.maxFpts;
      }

      if (side1Total > 0 || side2Total > 0) {
        weeks.push({
          week: `W${w}`,
          side1: Number(side1Total.toFixed(1)),
          side2: Number(side2Total.toFixed(1)),
        });
      }
    }

    return weeks;
  };

  // Per-player comparison data
  const getPlayerComparisonData = () => {
    const allPlayers = [
      ...side1.players.map(p => ({ ...p, side: 'A' as const })),
      ...side2.players.map(p => ({ ...p, side: 'B' as const })),
    ];

    return allPlayers.map(p => {
      const stats = calcPlayerStats(p, periodConfig.weeks);
      return {
        name: p.player.split(' ').pop() || p.player,
        fullName: p.player,
        side: p.side,
        lockin: stats.expectedLockin,
        ceiling: stats.ceiling,
        floor: stats.floor,
        trend: p.lockinTrend,
      };
    }).sort((a, b) => b.lockin - a.lockin);
  };

  const handleTeamChange = (side: 1 | 2, teamName: string) => {
    if (side === 1) {
      setSide1({ team: teamName, players: [] });
    } else {
      setSide2({ team: teamName, players: [] });
    }
  };

  const addPlayer = (side: 1 | 2, player: PlayerAnalytics) => {
    if (side === 1) {
      if (!side1.players.find(p => p.sleeper_id === player.sleeper_id)) {
        setSide1({ ...side1, players: [...side1.players, player] });
      }
    } else {
      if (!side2.players.find(p => p.sleeper_id === player.sleeper_id)) {
        setSide2({ ...side2, players: [...side2.players, player] });
      }
    }
  };

  const removePlayer = (side: 1 | 2, playerId: string) => {
    if (side === 1) {
      setSide1({ ...side1, players: side1.players.filter(p => p.sleeper_id !== playerId) });
    } else {
      setSide2({ ...side2, players: side2.players.filter(p => p.sleeper_id !== playerId) });
    }
  };

  const clearSide = (side: 1 | 2) => {
    if (side === 1) {
      setSide1({ team: '', players: [], streamerCount: 0 });
    } else {
      setSide2({ team: '', players: [], streamerCount: 0 });
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'RISING': return <TrendingUp size={12} />;
      case 'FALLING': return <TrendingDown size={12} />;
      default: return <Minus size={12} />;
    }
  };

  return (
    <div className="trade-machine">
      {/* Header with Time Period Filter */}
      <div className="trade-header">
        <div className="trade-header-top">
          <h2 className="trade-title">
            <ArrowLeftRight size={22} />
            Trade Analyzer
          </h2>
          <div className="header-controls">
            <div className="time-period-selector">
              <Calendar size={14} />
              {TIME_PERIODS.map(period => (
                <button
                  key={period.value}
                  className={`period-btn ${timePeriod === period.value ? 'active' : ''}`}
                  onClick={() => setTimePeriod(period.value)}
                >
                  {period.label}
                </button>
              ))}
            </div>
            <div className="streaming-controls">
              <label className="streaming-toggle">
                <input
                  type="checkbox"
                  checked={includeStreaming}
                  onChange={e => setIncludeStreaming(e.target.checked)}
                />
                <span>Streaming</span>
              </label>
              {includeStreaming && (
                <div className="streaming-option-selector">
                  {STREAMING_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      className={`streaming-opt-btn ${streamingOption === opt.value ? 'active' : ''}`}
                      onClick={() => setStreamingOption(opt.value)}
                      title={opt.value === 'bottom25' ? 'Bottom 25% of rostered players' : `Average of ${opt.label}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <p className="trade-subtitle">
          Compare player values based on {periodConfig.label.toLowerCase()} performance
          {includeStreaming && (
            <span className="streaming-note">
              {' '}• Streaming: ~{streamingValue.toFixed(1)} pts
              {streamingOption !== 'bottom25' && topFreeAgents.length > 0 && (
                <span className="streaming-fa-list">
                  {' '}({topFreeAgents.slice(0, streamingOption === 'top1' ? 1 : streamingOption === 'top3' ? 3 : 5)
                    .map(fa => fa.player.player.split(' ').pop())
                    .join(', ')})
                </span>
              )}
            </span>
          )}
        </p>
      </div>

      {/* Trade Builder - Fixed Width */}
      <div className="trade-builder">
        {/* Side 1 */}
        <div className="trade-side">
          <div className="side-header">
            <h3>Side A Gives</h3>
            {side1.team && (
              <button className="clear-btn" onClick={() => clearSide(1)}>
                Clear
              </button>
            )}
          </div>

          <div className="team-selector">
            <select
              className="team-select"
              value={side1.team}
              onChange={e => handleTeamChange(1, e.target.value)}
            >
              <option value="">Select team...</option>
              {teams.map(t => (
                <option key={t.rosterId} value={t.ownerName}>
                  {t.teamName}
                </option>
              ))}
            </select>
          </div>

          {side1.team && (
            <div className="player-selector">
              <label>Available Players</label>
              <div className="available-players">
                {getTeamPlayers(side1.team)
                  .filter(p => !side1.players.find(sp => sp.sleeper_id === p.sleeper_id))
                  .map(player => (
                    <button
                      key={player.sleeper_id}
                      className="player-chip"
                      onClick={() => addPlayer(1, player)}
                    >
                      <span className="chip-name">{player.player.split(' ').pop()}</span>
                      <span className="chip-value">{player.periodStats.expectedLockin.toFixed(1)}</span>
                      <Plus size={12} />
                    </button>
                  ))}
              </div>
            </div>
          )}

          <div className="selected-players">
            {side1.players.length === 0 ? (
              <div className="empty-selection">Select players above</div>
            ) : (
              <div className="selected-list">
                {side1.players.map(player => {
                  const stats = getPlayerPeriodStats(player);
                  return (
                    <div key={player.sleeper_id} className="selected-player">
                      <div className="player-main">
                        <span className="player-name">{player.player}</span>
                        <button
                          className="remove-btn"
                          onClick={() => removePlayer(1, player.sleeper_id)}
                        >
                          <X size={12} />
                        </button>
                      </div>
                      <div className="player-stats-row">
                        <div className="stat-item">
                          <span className="stat-label">Lock-In</span>
                          <span className="stat-value primary">{stats.expectedLockin.toFixed(1)}</span>
                        </div>
                        <div className="stat-item">
                          <span className="stat-label">Ceiling</span>
                          <span className="stat-value ceiling">{stats.ceiling.toFixed(1)}</span>
                        </div>
                        <div className="stat-item">
                          <span className="stat-label">Floor</span>
                          <span className="stat-value floor">{stats.floor.toFixed(1)}</span>
                        </div>
                        <div className="stat-item">
                          <span className="stat-label">Min</span>
                          <span className="stat-value">{stats.avgMinutes.toFixed(0)}</span>
                        </div>
                        <div className={`stat-item trend ${player.lockinTrend.toLowerCase()}`}>
                          {getTrendIcon(player.lockinTrend)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Add Streamer Button */}
          {includeStreaming && (
            <div className="add-streamer-section">
              <button
                className="btn btn-ghost add-streamer-btn"
                onClick={() => addStreamer(1)}
              >
                <Zap size={14} />
                Add Streamer (+{streamingValue.toFixed(1)})
              </button>
            </div>
          )}

          {/* Streamers display */}
          {side1.streamerCount > 0 && (
            <div className="streamers-list">
              {Array.from({ length: side1.streamerCount }).map((_, i) => (
                <div key={i} className="streamer-item">
                  <div className="streamer-main">
                    <Zap size={14} />
                    <span className="streamer-name">Streamer Slot</span>
                    <button
                      className="remove-btn"
                      onClick={() => removeStreamer(1)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <div className="streamer-value">{streamingValue.toFixed(1)}</div>
                </div>
              ))}
            </div>
          )}

          {(side1.players.length > 0 || side1.streamerCount > 0) && (
            <div className="side-total">
              <div className="total-row">
                <span>Players ({side1.players.length})</span>
                <span className="total-value">{totals1.lockin.toFixed(1)}</span>
              </div>
              {side1.streamerCount > 0 && (
                <div className="total-row">
                  <span>Streamers ({side1.streamerCount})</span>
                  <span className="total-value">{totals1.streamerLockin.toFixed(1)}</span>
                </div>
              )}
              <div className="total-row total-final">
                <span>Total Giving</span>
                <span className="total-value negative">{totals1.totalLockin.toFixed(1)}</span>
              </div>
            </div>
          )}
        </div>

        {/* VS Divider */}
        <div className="vs-divider">
          <Scale size={20} />
        </div>

        {/* Side 2 */}
        <div className="trade-side">
          <div className="side-header">
            <h3>Side A Receives</h3>
            {side2.team && (
              <button className="clear-btn" onClick={() => clearSide(2)}>
                Clear
              </button>
            )}
          </div>

          <div className="team-selector">
            <select
              className="team-select"
              value={side2.team}
              onChange={e => handleTeamChange(2, e.target.value)}
            >
              <option value="">Select team...</option>
              {teams.map(t => (
                <option key={t.rosterId} value={t.ownerName}>
                  {t.teamName}
                </option>
              ))}
            </select>
          </div>

          {side2.team && (
            <div className="player-selector">
              <label>Available Players</label>
              <div className="available-players">
                {getTeamPlayers(side2.team)
                  .filter(p => !side2.players.find(sp => sp.sleeper_id === p.sleeper_id))
                  .map(player => (
                    <button
                      key={player.sleeper_id}
                      className="player-chip"
                      onClick={() => addPlayer(2, player)}
                    >
                      <span className="chip-name">{player.player.split(' ').pop()}</span>
                      <span className="chip-value">{player.periodStats.expectedLockin.toFixed(1)}</span>
                      <Plus size={12} />
                    </button>
                  ))}
              </div>
            </div>
          )}

          <div className="selected-players">
            {side2.players.length === 0 ? (
              <div className="empty-selection">Select players above</div>
            ) : (
              <div className="selected-list">
                {side2.players.map(player => {
                  const stats = getPlayerPeriodStats(player);
                  return (
                    <div key={player.sleeper_id} className="selected-player">
                      <div className="player-main">
                        <span className="player-name">{player.player}</span>
                        <button
                          className="remove-btn"
                          onClick={() => removePlayer(2, player.sleeper_id)}
                        >
                          <X size={12} />
                        </button>
                      </div>
                      <div className="player-stats-row">
                        <div className="stat-item">
                          <span className="stat-label">Lock-In</span>
                          <span className="stat-value primary">{stats.expectedLockin.toFixed(1)}</span>
                        </div>
                        <div className="stat-item">
                          <span className="stat-label">Ceiling</span>
                          <span className="stat-value ceiling">{stats.ceiling.toFixed(1)}</span>
                        </div>
                        <div className="stat-item">
                          <span className="stat-label">Floor</span>
                          <span className="stat-value floor">{stats.floor.toFixed(1)}</span>
                        </div>
                        <div className="stat-item">
                          <span className="stat-label">Min</span>
                          <span className="stat-value">{stats.avgMinutes.toFixed(0)}</span>
                        </div>
                        <div className={`stat-item trend ${player.lockinTrend.toLowerCase()}`}>
                          {getTrendIcon(player.lockinTrend)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Add Streamer Button */}
          {includeStreaming && (
            <div className="add-streamer-section">
              <button
                className="btn btn-ghost add-streamer-btn"
                onClick={() => addStreamer(2)}
              >
                <Zap size={14} />
                Add Streamer (+{streamingValue.toFixed(1)})
              </button>
            </div>
          )}

          {/* Streamers display */}
          {side2.streamerCount > 0 && (
            <div className="streamers-list">
              {Array.from({ length: side2.streamerCount }).map((_, i) => (
                <div key={i} className="streamer-item">
                  <div className="streamer-main">
                    <Zap size={14} />
                    <span className="streamer-name">Streamer Slot</span>
                    <button
                      className="remove-btn"
                      onClick={() => removeStreamer(2)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <div className="streamer-value">{streamingValue.toFixed(1)}</div>
                </div>
              ))}
            </div>
          )}

          {(side2.players.length > 0 || side2.streamerCount > 0) && (
            <div className="side-total">
              <div className="total-row">
                <span>Players ({side2.players.length})</span>
                <span className="total-value">{totals2.lockin.toFixed(1)}</span>
              </div>
              {side2.streamerCount > 0 && (
                <div className="total-row">
                  <span>Streamers ({side2.streamerCount})</span>
                  <span className="total-value">{totals2.streamerLockin.toFixed(1)}</span>
                </div>
              )}
              <div className="total-row total-final">
                <span>Total Receiving</span>
                <span className="total-value positive">{totals2.totalLockin.toFixed(1)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Analysis Results */}
      {analysis && (
        <motion.div
          className="trade-analysis"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {/* Verdict */}
          <div className={`verdict-card ${analysis.recommendation.toLowerCase()}`}>
            <div className="verdict-icon">
              {analysis.recommendation === 'FAVOR_1' && <Check size={24} />}
              {analysis.recommendation === 'FAVOR_2' && <AlertCircle size={24} />}
              {analysis.recommendation === 'EVEN' && <Scale size={24} />}
            </div>
            <div className="verdict-content">
              <h3 className="verdict-title">
                {analysis.recommendation === 'FAVOR_1' && `Side A Wins (+${Math.abs(analysis.sideANet).toFixed(1)} net)`}
                {analysis.recommendation === 'FAVOR_2' && `Side A Loses (${analysis.sideANet.toFixed(1)} net)`}
                {analysis.recommendation === 'EVEN' && 'Fair Trade'}
              </h3>
              <div className="verdict-details">
                <div className="verdict-row">
                  <span>Gives {analysis.totalGiven.toFixed(1)} pts</span>
                  <span>Receives {analysis.totalReceived.toFixed(1)} pts</span>
                  <span className={analysis.sideANet >= 0 ? 'positive' : 'negative'}>
                    {analysis.sideANet >= 0 ? '+' : ''}{analysis.sideANet.toFixed(1)} net
                  </span>
                </div>
              </div>
              <div className="verdict-meta">
                <span className="meta-item">
                  <Info size={12} />
                  Based on {periodConfig.label.toLowerCase()} data
                </span>
                {includeStreaming && analysis.rosterSpotDiff !== 0 && (
                  <span className={`meta-item ${analysis.rosterSpotDiff > 0 ? 'streaming' : 'cost'}`}>
                    <Zap size={12} />
                    {analysis.rosterSpotDiff > 0
                      ? `Side A gains ${analysis.rosterSpotDiff} roster spot(s) (+${analysis.rosterSpotAdjustment.toFixed(1)})`
                      : `Side A loses ${Math.abs(analysis.rosterSpotDiff)} roster spot(s) (${analysis.rosterSpotAdjustment.toFixed(1)})`
                    }
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Stats Comparison Grid */}
          <div className="comparison-grid">
            {/* Summary Card */}
            <div className="comparison-card summary-card">
              <h4>Trade Summary</h4>
              <div className="summary-content">
                <div className="summary-side">
                  <div className="summary-label">Side A Gives</div>
                  <div className="summary-value">{analysis.totalGiven.toFixed(1)}</div>
                  <div className="summary-breakdown">
                    {side1.players.length} player(s): {totals1.lockin.toFixed(1)}
                    {side1.streamerCount > 0 && <span> + {side1.streamerCount} streamer(s): {totals1.streamerLockin.toFixed(1)}</span>}
                    {analysis.rosterSpotDiff < 0 && <span className="cost"> + roster cost: {Math.abs(analysis.rosterSpotAdjustment).toFixed(1)}</span>}
                  </div>
                </div>
                <div className="summary-arrow">
                  <ArrowLeftRight size={24} />
                </div>
                <div className="summary-side">
                  <div className="summary-label">Side A Receives</div>
                  <div className="summary-value">{analysis.totalReceived.toFixed(1)}</div>
                  <div className="summary-breakdown">
                    {side2.players.length} player(s): {totals2.lockin.toFixed(1)}
                    {side2.streamerCount > 0 && <span> + {side2.streamerCount} streamer(s): {totals2.streamerLockin.toFixed(1)}</span>}
                    {analysis.rosterSpotDiff > 0 && <span className="bonus"> + roster gain: {analysis.rosterSpotAdjustment.toFixed(1)}</span>}
                  </div>
                </div>
              </div>
              <div className={`summary-result ${analysis.sideANet >= 0 ? 'positive' : 'negative'}`}>
                Net: {analysis.sideANet >= 0 ? '+' : ''}{analysis.sideANet.toFixed(1)} for Side A
              </div>
            </div>

            {/* Per-Player Comparison Chart */}
            <div className="comparison-card">
              <h4>Player Comparison</h4>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={getPlayerComparisonData()} layout="vertical">
                  <XAxis type="number" stroke="var(--text-muted)" fontSize={10} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke="var(--text-muted)"
                    fontSize={10}
                    tickLine={false}
                    width={60}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: 'var(--text-primary)',
                    }}
                    formatter={(value, _name, props) => [
                      typeof value === 'number' ? value.toFixed(1) : '0',
                      props?.payload?.side === 'A' ? 'Side A (Giving)' : 'Side A (Receiving)'
                    ]}
                  />
                  <Bar dataKey="lockin" name="Lock-In" radius={[0, 4, 4, 0]}>
                    {getPlayerComparisonData().map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.side === 'A' ? '#ef4444' : '#10b981'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Weekly Trend Chart */}
            <div className="comparison-card full-width">
              <h4>Weekly Performance Comparison</h4>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={getWeeklyComparison()}>
                  <XAxis dataKey="week" stroke="var(--text-muted)" fontSize={10} tickLine={false} />
                  <YAxis stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="side1"
                    name="Giving"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="side2"
                    name="Receiving"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

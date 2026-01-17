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
import {
  calcPlayerPeriodStats,
  filterByInjuryStatus,
} from '../lib/analytics';
import './TradeMachine.css';

interface Props {
  players: PlayerAnalytics[];
  teams: TeamAnalytics[];
}

type TimePeriod = 'all' | 'L3W' | 'L4W' | 'L5W' | 'L6W' | 'L8W';
type StreamingOption = 'top1' | 'top3' | 'top5' | 'bottom25';

interface StreamerSlot {
  option: StreamingOption;
  value: number;
}

interface TradeSide {
  team: string;
  players: PlayerAnalytics[];
  streamers: StreamerSlot[]; // Streamer slots with their options
}

const TIME_PERIODS: { value: TimePeriod; label: string; weeks: number }[] = [
  { value: 'all', label: 'Season', weeks: 99 },
  { value: 'L3W', label: '3W', weeks: 3 },
  { value: 'L4W', label: '4W', weeks: 4 },
  { value: 'L5W', label: '5W', weeks: 5 },
  { value: 'L6W', label: '6W', weeks: 6 },
  { value: 'L8W', label: '8W', weeks: 8 },
];

const STREAMING_OPTIONS: { value: StreamingOption; label: string; description: string }[] = [
  { value: 'top1', label: 'Top FA', description: 'Best free agent lock-in' },
  { value: 'top3', label: 'Top 3 FA', description: 'Avg of top 3 free agents' },
  { value: 'top5', label: 'Top 5 FA', description: 'Avg of top 5 free agents' },
  { value: 'bottom25', label: 'Stream Line', description: 'Bottom 25% of rostered' },
];

// Use shared calculation from analytics.ts
const calcPlayerStats = calcPlayerPeriodStats;

export default function TradeMachine({ players, teams }: Props) {
  const [side1, setSide1] = useState<TradeSide>({ team: '', players: [], streamers: [] });
  const [side2, setSide2] = useState<TradeSide>({ team: '', players: [], streamers: [] });
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('L4W');
  const [showStreamerMenu, setShowStreamerMenu] = useState<1 | 2 | null>(null);

  // Safe accessors for arrays that might be undefined during state transitions
  const side1Players = side1.players || [];
  const side2Players = side2.players || [];
  const side2Streamers = side2.streamers || [];

  const periodConfig = TIME_PERIODS.find(p => p.value === timePeriod)!;

  // Get rostered player IDs
  const rosteredIds = useMemo(() => {
    return new Set(teams.flatMap(t => t.players.map(p => p.sleeper_id)));
  }, [teams]);

  // Get top free agents sorted by expected lock-in
  // IMPORTANT: Filter out injured (OUT/IR) players - they're not actually available
  const topFreeAgents = useMemo(() => {
    const freeAgents = players.filter(p => !rosteredIds.has(p.sleeper_id));
    // Filter out OUT and IR players - they're not available for streaming
    const healthyFreeAgents = filterByInjuryStatus(freeAgents, true, true);

    return healthyFreeAgents
      .map(p => ({
        player: p,
        stats: calcPlayerStats(p, periodConfig.weeks),
      }))
      .filter(p => p.stats.expectedLockin > 0)
      .sort((a, b) => b.stats.expectedLockin - a.stats.expectedLockin)
      .slice(0, 10); // Top 10 free agents
  }, [players, rosteredIds, periodConfig.weeks]);

  // Get streaming values for all options (for display in menu)
  const streamingValues = useMemo(() => {
    const calcStreamingValue = (option: StreamingOption): number => {
      if (option === 'bottom25') {
        // Bottom 25% of rostered players
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

      const count = option === 'top1' ? 1 : option === 'top3' ? 3 : 5;
      const topN = topFreeAgents.slice(0, count);

      return topN.reduce((sum, p) => sum + p.stats.expectedLockin, 0) / topN.length;
    };

    return {
      top1: calcStreamingValue('top1'),
      top3: calcStreamingValue('top3'),
      top5: calcStreamingValue('top5'),
      bottom25: calcStreamingValue('bottom25'),
    };
  }, [players, rosteredIds, topFreeAgents, periodConfig.weeks]);

  // Helper to get streaming value by option (uses memoized values)
  const getStreamingValue = (option: StreamingOption): number => {
    return streamingValues[option];
  };

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
    const players = tradeSide.players || [];
    const streamers = tradeSide.streamers || [];

    const playerStats = players.map(p => calcPlayerStats(p, periodConfig.weeks));
    const playerLockin = playerStats.reduce((sum, s) => sum + s.expectedLockin, 0);
    // Recalculate streamer values based on current period (in case period changed)
    const streamerLockin = streamers.reduce((sum, s) => sum + getStreamingValue(s.option), 0);

    return {
      lockin: playerLockin,
      streamerLockin,
      totalLockin: playerLockin + streamerLockin,
      avg: playerStats.reduce((sum, s) => sum + s.avgFpts, 0),
      ceiling: playerStats.reduce((sum, s) => sum + s.ceiling, 0),
      floor: playerStats.reduce((sum, s) => sum + s.floor, 0),
      avgMinutes: playerStats.reduce((sum, s) => sum + s.avgMinutes, 0),
      players: players.length,
      streamers: streamers.length,
    };
  };

  const totals1 = useMemo(() => calculateTotals(side1), [side1, periodConfig.weeks, streamingValues]);
  const totals2 = useMemo(() => calculateTotals(side2), [side2, periodConfig.weeks, streamingValues]);

  // Get per-player stats for display
  const getPlayerPeriodStats = (player: PlayerAnalytics) => {
    return calcPlayerStats(player, periodConfig.weeks);
  };

  // Add/remove streamer for a side
  const addStreamer = (side: 1 | 2, option: StreamingOption) => {
    const value = getStreamingValue(option);
    const newStreamer: StreamerSlot = { option, value };
    if (side === 1) {
      setSide1(prev => ({ ...prev, streamers: [...prev.streamers, newStreamer] }));
    } else {
      setSide2(prev => ({ ...prev, streamers: [...prev.streamers, newStreamer] }));
    }
    setShowStreamerMenu(null);
  };

  const removeStreamer = (side: 1 | 2, index: number) => {
    if (side === 1) {
      setSide1(prev => ({ ...prev, streamers: prev.streamers.filter((_, i) => i !== index) }));
    } else {
      setSide2(prev => ({ ...prev, streamers: prev.streamers.filter((_, i) => i !== index) }));
    }
  };

  // Trade analysis - SIMPLE and CORRECT
  // - NO automatic streamer value - user must manually add streamers to "Side A Receives"
  // - Streamers represent the value of open roster spots after trade
  // - If you give 2 and receive 1, you have 1 open spot → add a streamer to "Receives" to model that value
  const analysis = useMemo(() => {
    const side1Players = side1.players || [];
    const side2Players = side2.players || [];
    const side2Streamers = side2.streamers || [];

    // Need at least one player on Gives side
    if (side1Players.length === 0) return null;
    // Need at least one player OR streamer on Receives side
    if (side2Players.length === 0 && side2Streamers.length === 0) return null;

    // Roster spot diff: positive = you give more than you receive = you gain open roster spots
    const rosterSpotDiff = side1Players.length - side2Players.length;

    // What Side A is giving up (players only - no streamers on give side)
    const sideAGivesPlayers = totals1.lockin;

    // What Side A receives (players + streamers user added to model streaming value)
    const sideAReceivesPlayers = totals2.lockin;
    const sideAReceivesStreamers = totals2.streamerLockin;

    // Simple calculation: NO auto-adjustment
    // User adds streamers to "Receives" if they want to account for roster flexibility
    const totalReceived = sideAReceivesPlayers + sideAReceivesStreamers;
    const totalGiven = sideAGivesPlayers;

    const sideANet = totalReceived - totalGiven;

    let recommendation: 'FAVOR_1' | 'FAVOR_2' | 'EVEN' = 'EVEN';
    if (sideANet > 3) recommendation = 'FAVOR_1';
    else if (sideANet < -3) recommendation = 'FAVOR_2';

    // Compare trends
    const side1Trends = side1Players.map(p => {
      const recent = calcPlayerStats(p, 3);
      const earlier = calcPlayerStats(p, 99);
      return recent.expectedLockin - earlier.expectedLockin;
    });
    const side2Trends = side2Players.map(p => {
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
      streamersAdded: side2Streamers.length, // Track if user added streamers to account for open spots
      recommendation,
      avgTrend1,
      avgTrend2,
    };
  }, [totals1, totals2, side1, side2, streamingValues]);

  // Get weekly comparison data for chart (memoized)
  const weeklyComparisonData = useMemo(() => {
    const side1Players = side1.players || [];
    const side2Players = side2.players || [];

    if (side1Players.length === 0 && side2Players.length === 0) return [];

    const currentWeek = Math.max(
      ...players.flatMap(p => p.weeklyStats.map(w => w.week))
    );
    const startWeek = periodConfig.weeks === 99 ? 1 : currentWeek - periodConfig.weeks + 1;

    const weeks: { week: string; side1: number; side2: number }[] = [];

    for (let w = Math.max(1, startWeek); w <= currentWeek; w++) {
      let side1Total = 0;
      let side2Total = 0;

      for (const p of side1Players) {
        const weekData = p.weeklyStats.find(ws => ws.week === w);
        if (weekData) side1Total += weekData.maxFpts;
      }

      for (const p of side2Players) {
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
  }, [side1.players, side2.players, players, periodConfig.weeks]);

  // Per-player comparison data (memoized)
  const playerComparisonData = useMemo(() => {
    const side1Players = side1.players || [];
    const side2Players = side2.players || [];

    const allPlayers = [
      ...side1Players.map(p => ({ ...p, side: 'A' as const })),
      ...side2Players.map(p => ({ ...p, side: 'B' as const })),
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
  }, [side1.players, side2.players, periodConfig.weeks]);

  const handleTeamChange = (side: 1 | 2, teamName: string) => {
    if (side === 1) {
      setSide1({ team: teamName, players: [], streamers: [] });
    } else {
      setSide2({ team: teamName, players: [], streamers: [] });
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
      setSide1({ team: '', players: [], streamers: [] });
    } else {
      setSide2({ team: '', players: [], streamers: [] });
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
          </div>
        </div>
        <p className="trade-subtitle">
          Compare player values based on {periodConfig.label.toLowerCase()} performance
          <span className="streaming-note">
            {' '}• Top FA: {streamingValues.top1.toFixed(1)} | Top 3 Avg: {streamingValues.top3.toFixed(1)} | Top 5 Avg: {streamingValues.top5.toFixed(1)}
          </span>
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

          {/* No streamers on Gives side - streamers only make sense for the Receives side */}

          {side1Players.length > 0 && (
            <div className="side-total">
              <div className="total-row total-final">
                <span>Total Giving</span>
                <span className="total-value negative">{totals1.lockin.toFixed(1)}</span>
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

          {/* Add Streamer Button with Dropdown */}
          <div className="add-streamer-section">
            <button
              className="btn btn-ghost add-streamer-btn"
              onClick={() => setShowStreamerMenu(showStreamerMenu === 2 ? null : 2)}
            >
              <Zap size={14} />
              Add Streamer
            </button>
            {showStreamerMenu === 2 && (
              <div className="streamer-menu">
                {STREAMING_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    className="streamer-menu-item"
                    onClick={() => addStreamer(2, opt.value)}
                  >
                    <span className="menu-item-label">{opt.label}</span>
                    <span className="menu-item-value">+{streamingValues[opt.value].toFixed(1)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Streamers display */}
          {side2Streamers.length > 0 && (
            <div className="streamers-list">
              {side2Streamers.map((streamer, i) => {
                const optionLabel = STREAMING_OPTIONS.find(o => o.value === streamer.option)?.label || 'Streamer';
                const currentValue = getStreamingValue(streamer.option);
                return (
                  <div key={i} className="streamer-item">
                    <div className="streamer-main">
                      <Zap size={14} />
                      <span className="streamer-name">{optionLabel}</span>
                      <button
                        className="remove-btn"
                        onClick={() => removeStreamer(2, i)}
                      >
                        <X size={12} />
                      </button>
                    </div>
                    <div className="streamer-value">{currentValue.toFixed(1)}</div>
                  </div>
                );
              })}
            </div>
          )}

          {(side2Players.length > 0 || side2Streamers.length > 0) && (
            <div className="side-total">
              <div className="total-row">
                <span>Players ({side2Players.length})</span>
                <span className="total-value">{totals2.lockin.toFixed(1)}</span>
              </div>
              {side2Streamers.length > 0 && (
                <div className="total-row">
                  <span>Streamers ({side2Streamers.length})</span>
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
                {analysis.rosterSpotDiff > 0 && (
                  <span className="meta-item streaming">
                    <Zap size={12} />
                    {`${analysis.rosterSpotDiff} open roster spot(s)`}
                    {analysis.streamersAdded === 0 && ' - add streamers to Receives to value them'}
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
                    {side1Players.length} player(s): {totals1.lockin.toFixed(1)}
                  </div>
                </div>
                <div className="summary-arrow">
                  <ArrowLeftRight size={24} />
                </div>
                <div className="summary-side">
                  <div className="summary-label">Side A Receives</div>
                  <div className="summary-value">{analysis.totalReceived.toFixed(1)}</div>
                  <div className="summary-breakdown">
                    {side2Players.length} player(s): {totals2.lockin.toFixed(1)}
                    {side2Streamers.length > 0 && <span> + {side2Streamers.length} streamer(s): {totals2.streamerLockin.toFixed(1)}</span>}
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
                <BarChart data={playerComparisonData} layout="vertical">
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
                    {playerComparisonData.map((entry, index) => (
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
                <LineChart data={weeklyComparisonData}>
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

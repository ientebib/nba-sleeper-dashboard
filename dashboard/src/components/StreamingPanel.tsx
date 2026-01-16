import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  ChevronDown,
  ChevronUp,
  SortAsc,
  BarChart3,
  X,
  Calendar,
  UserPlus,
  Users,
  AlertTriangle,
  Target,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  Legend,
  Cell,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from 'recharts';
import type { PlayerAnalytics, TeamAnalytics, Roster } from '../types';
import type { SleeperPlayer, NBASchedule } from '../lib/dataLoader';
import './StreamingPanel.css';

interface Props {
  players: PlayerAnalytics[];
  teams: TeamAnalytics[];
  rosters: Roster[];
  allNbaPlayers: Record<string, SleeperPlayer>;
  onPlayerSelect: (player: PlayerAnalytics) => void;
  nbaSchedule: NBASchedule | null;
}

type SortKey = 'expectedLockin' | 'avgFpts' | 'lockinCeiling' | 'lockinFloor' | 'avgMinutes' | 'totalGames' | 'lockinTrendPct';
type SortDir = 'asc' | 'desc';
type TimePeriod = 'all' | 'L3W' | 'L4W' | 'L6W' | 'L8W';
type ViewMode = 'freeAgents' | 'all' | 'dropCandidates';

const TIME_PERIODS: { value: TimePeriod; label: string; weeks: number }[] = [
  { value: 'all', label: 'Season', weeks: 99 },
  { value: 'L3W', label: '3W', weeks: 3 },
  { value: 'L4W', label: '4W', weeks: 4 },
  { value: 'L6W', label: '6W', weeks: 6 },
  { value: 'L8W', label: '8W', weeks: 8 },
];

const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

// Injury statuses that mean player is not available
const INJURED_OUT_STATUSES = ['OUT', 'IR', 'Injured Reserve', 'OFS'];

function calcPlayerStats(player: PlayerAnalytics, maxWeeks: number) {
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

  const avg = maxFptsList.reduce((a, b) => a + b, 0) / totalWeeks;
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
    expectedLockin: avg,
    medianLockin,
    avgFpts: avgFptsList.reduce((a, b) => a + b, 0) / avgFptsList.length,
    ceiling,
    floor,
    avgMinutes: minutesList.reduce((a, b) => a + b, 0) / minutesList.length,
    pct40plus,
    pct45plus,
    pctBust,
    reliability: Math.max(0, Math.min(100, reliability)),
  };
}

// Calculate Lock-In for specific week range
function calcLockinForWeeks(player: PlayerAnalytics, startWeeksAgo: number, endWeeksAgo: number = 0) {
  const currentWeek = Math.max(...player.weeklyStats.map(w => w.week));
  const startWeek = currentWeek - startWeeksAgo + 1;
  const endWeek = currentWeek - endWeeksAgo;

  const filteredWeeks = player.weeklyStats.filter(w => w.week >= startWeek && w.week <= endWeek);
  if (filteredWeeks.length === 0) return null;

  const maxes = filteredWeeks.map(w => w.maxFpts);
  return maxes.reduce((a, b) => a + b, 0) / maxes.length;
}

// Calculate all trend comparisons for a player
function calcTrends(player: PlayerAnalytics) {
  const l2w = calcLockinForWeeks(player, 2, 0);  // Last 2 weeks
  const l4w = calcLockinForWeeks(player, 4, 0);  // Last 4 weeks
  const l6w = calcLockinForWeeks(player, 6, 0);  // Last 6 weeks
  const l8w = calcLockinForWeeks(player, 8, 0);  // Last 8 weeks
  const prev2w = calcLockinForWeeks(player, 4, 2);  // Weeks 3-4 ago
  const prev4w = calcLockinForWeeks(player, 8, 4);  // Weeks 5-8 ago

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
    delta2v4,  // Short-term momentum: positive = hot, negative = cold
    delta4v8,  // Medium-term trend: positive = improving, negative = declining
  };
}

// Get remaining games for a team this week
function getRemainingGames(team: string, schedule: NBASchedule | null): { count: number; games: Array<{ opponent: string; home: boolean; date: string }> } {
  if (!schedule) return { count: 0, games: [] };
  const remaining = schedule.remainingThisWeek[team] || [];
  return {
    count: remaining.length,
    games: remaining.map(g => ({ opponent: g.opponent, home: g.home, date: g.date })),
  };
}

export default function StreamingPanel({ players, rosters, onPlayerSelect, nbaSchedule }: Props) {
  const [search, setSearch] = useState('');
  const [positionFilter, setPositionFilter] = useState<string>('');
  const [sortKey, setSortKey] = useState<SortKey>('expectedLockin');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedPlayers, setSelectedPlayers] = useState<PlayerAnalytics[]>([]);
  const [showComparison, setShowComparison] = useState(false);
  const [comparisonPeriod, setComparisonPeriod] = useState<TimePeriod>('L4W');
  const [viewMode, setViewMode] = useState<ViewMode>('freeAgents');
  const [hideInjured, setHideInjured] = useState(true);

  const periodConfig = TIME_PERIODS.find(p => p.value === comparisonPeriod)!;

  // Get rostered player IDs from rosters
  const rosteredPlayerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const roster of rosters) {
      for (const player of roster.players) {
        ids.add(player.sleeper_id);
      }
    }
    return ids;
  }, [rosters]);

  // Separate players into free agents and rostered
  const { freeAgentPlayers, rosteredPlayers } = useMemo(() => {
    const freeAgents: PlayerAnalytics[] = [];
    const rostered: PlayerAnalytics[] = [];

    for (const player of players) {
      if (rosteredPlayerIds.has(player.sleeper_id)) {
        rostered.push(player);
      } else {
        freeAgents.push(player);
      }
    }

    return { freeAgentPlayers: freeAgents, rosteredPlayers: rostered };
  }, [players, rosteredPlayerIds]);

  // Filter out injured players from free agents
  const healthyFreeAgents = useMemo(() => {
    if (!hideInjured) return freeAgentPlayers;
    return freeAgentPlayers.filter(p => {
      const status = p.injury_status?.toUpperCase();
      return !status || !INJURED_OUT_STATUSES.some(s => status.includes(s));
    });
  }, [freeAgentPlayers, hideInjured]);

  // Calculate streaming line (bottom 25% of rostered players)
  const streamingLine = useMemo(() => {
    const rosteredStats = rosteredPlayers
      .map(p => calcPlayerStats(p, periodConfig.weeks).expectedLockin)
      .filter(v => v > 0)
      .sort((a, b) => a - b);

    if (rosteredStats.length === 0) return 30;

    const bottom25Idx = Math.floor(rosteredStats.length * 0.25);
    const bottom25 = rosteredStats.slice(0, Math.max(1, bottom25Idx));
    return bottom25.reduce((a, b) => a + b, 0) / bottom25.length;
  }, [rosteredPlayers, periodConfig.weeks]);

  // Drop candidates (rostered players below streaming line)
  const dropCandidates = useMemo(() => {
    return rosteredPlayers.filter(p => {
      const stats = calcPlayerStats(p, periodConfig.weeks);
      return stats.expectedLockin < streamingLine * 1.15;
    });
  }, [rosteredPlayers, streamingLine, periodConfig.weeks]);

  // Get players based on view mode
  const basePlayers = useMemo(() => {
    switch (viewMode) {
      case 'freeAgents':
        return healthyFreeAgents;
      case 'dropCandidates':
        return dropCandidates;
      case 'all':
      default:
        return players;
    }
  }, [viewMode, healthyFreeAgents, dropCandidates, players]);

  // Get unique positions
  const positions = useMemo(() => [...new Set(players.map(p => p.position))].sort(), [players]);

  // Filter and sort players
  const filteredPlayers = useMemo(() => {
    let result = basePlayers;

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(p =>
        p.player.toLowerCase().includes(searchLower) ||
        p.nba_team.toLowerCase().includes(searchLower) ||
        p.fantasy_team.toLowerCase().includes(searchLower)
      );
    }

    // Position filter
    if (positionFilter) {
      result = result.filter(p => p.position === positionFilter);
    }

    // Sort
    result = [...result].sort((a, b) => {
      const aVal = a[sortKey] as number;
      const bVal = b[sortKey] as number;
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });

    return result;
  }, [basePlayers, search, positionFilter, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const togglePlayerSelection = (player: PlayerAnalytics) => {
    if (selectedPlayers.find(p => p.sleeper_id === player.sleeper_id)) {
      setSelectedPlayers(selectedPlayers.filter(p => p.sleeper_id !== player.sleeper_id));
    } else if (selectedPlayers.length < 6) {
      setSelectedPlayers([...selectedPlayers, player]);
    }
  };

  const clearSelection = () => {
    setSelectedPlayers([]);
    setShowComparison(false);
  };

  // Comparison data
  const comparisonBarData = useMemo(() => {
    return selectedPlayers.map((p, idx) => {
      const stats = calcPlayerStats(p, periodConfig.weeks);
      return {
        name: p.player.split(' ').pop() || p.player,
        fullName: p.player,
        lockin: Number(stats.expectedLockin.toFixed(1)),
        ceiling: Number(stats.ceiling.toFixed(1)),
        floor: Number(stats.floor.toFixed(1)),
        color: CHART_COLORS[idx],
      };
    });
  }, [selectedPlayers, periodConfig.weeks]);

  const comparisonRadarData = useMemo(() => {
    if (selectedPlayers.length === 0) return [];

    const maxLockin = Math.max(...selectedPlayers.map(p => calcPlayerStats(p, periodConfig.weeks).expectedLockin));
    const maxCeiling = Math.max(...selectedPlayers.map(p => calcPlayerStats(p, periodConfig.weeks).ceiling));
    const maxMinutes = Math.max(...selectedPlayers.map(p => calcPlayerStats(p, periodConfig.weeks).avgMinutes));

    return [
      { stat: 'Lock-In', ...Object.fromEntries(selectedPlayers.map((p) => [p.player.split(' ').pop(), (calcPlayerStats(p, periodConfig.weeks).expectedLockin / maxLockin) * 100])) },
      { stat: 'Ceiling', ...Object.fromEntries(selectedPlayers.map((p) => [p.player.split(' ').pop(), (calcPlayerStats(p, periodConfig.weeks).ceiling / maxCeiling) * 100])) },
      { stat: 'Floor', ...Object.fromEntries(selectedPlayers.map((p) => [p.player.split(' ').pop(), (calcPlayerStats(p, periodConfig.weeks).floor / maxCeiling) * 100])) },
      { stat: 'Reliability', ...Object.fromEntries(selectedPlayers.map((p) => [p.player.split(' ').pop(), calcPlayerStats(p, periodConfig.weeks).reliability])) },
      { stat: 'Minutes', ...Object.fromEntries(selectedPlayers.map((p) => [p.player.split(' ').pop(), (calcPlayerStats(p, periodConfig.weeks).avgMinutes / maxMinutes) * 100])) },
    ];
  }, [selectedPlayers, periodConfig.weeks]);

  const weeklyLineData = useMemo(() => {
    if (selectedPlayers.length === 0) return [];

    const currentWeek = Math.max(...players.flatMap(p => p.weeklyStats.map(w => w.week)));
    const startWeek = periodConfig.weeks === 99 ? 1 : currentWeek - periodConfig.weeks + 1;

    const weeks: Record<string, any>[] = [];
    for (let w = Math.max(1, startWeek); w <= currentWeek; w++) {
      const weekData: Record<string, any> = { week: `W${w}` };
      for (const player of selectedPlayers) {
        const ws = player.weeklyStats.find(ws => ws.week === w);
        weekData[player.player.split(' ').pop() || player.player] = ws?.maxFpts || 0;
      }
      weeks.push(weekData);
    }
    return weeks;
  }, [selectedPlayers, players, periodConfig.weeks]);

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <SortAsc size={14} className="sort-icon inactive" />;
    return sortDir === 'desc'
      ? <ChevronDown size={14} className="sort-icon active" />
      : <ChevronUp size={14} className="sort-icon active" />;
  };

  return (
    <motion.div
      className="streaming-panel"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Filters - same layout as PlayersView */}
      <div className="filters-bar">
        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            className="input"
            placeholder="Search players..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select
          className="input select"
          value={positionFilter}
          onChange={e => setPositionFilter(e.target.value)}
        >
          <option value="">All Positions</option>
          {positions.map(pos => (
            <option key={pos} value={pos}>{pos}</option>
          ))}
        </select>

        {/* View Mode Selector */}
        <div className="view-mode-selector">
          <button
            className={`view-btn ${viewMode === 'freeAgents' ? 'active' : ''}`}
            onClick={() => setViewMode('freeAgents')}
          >
            <UserPlus size={14} />
            FA ({healthyFreeAgents.length})
          </button>
          <button
            className={`view-btn ${viewMode === 'all' ? 'active' : ''}`}
            onClick={() => setViewMode('all')}
          >
            <Users size={14} />
            All ({players.length})
          </button>
          <button
            className={`view-btn ${viewMode === 'dropCandidates' ? 'active' : ''}`}
            onClick={() => setViewMode('dropCandidates')}
          >
            <AlertTriangle size={14} />
            Drops ({dropCandidates.length})
          </button>
        </div>

        {selectedPlayers.length > 0 && (
          <button
            className="btn btn-primary compare-btn"
            onClick={() => setShowComparison(true)}
          >
            <BarChart3 size={16} />
            Compare ({selectedPlayers.length})
          </button>
        )}
      </div>

      {/* Selected Players Pills */}
      {selectedPlayers.length > 0 && (
        <div className="selected-players-bar">
          <span className="selected-label">Selected for comparison:</span>
          {selectedPlayers.map((player, idx) => (
            <span
              key={player.sleeper_id}
              className="selected-pill"
              style={{ borderColor: CHART_COLORS[idx] }}
            >
              <span className="pill-dot" style={{ background: CHART_COLORS[idx] }} />
              {player.player.split(' ').pop()}
              <button onClick={() => togglePlayerSelection(player)}>
                <X size={12} />
              </button>
            </span>
          ))}
          <button className="btn btn-ghost clear-selection" onClick={clearSelection}>
            Clear All
          </button>
        </div>
      )}

      {/* Streaming Info Bar */}
      <div className="streaming-info-bar">
        <div className="info-item">
          <Target size={14} />
          <span className="info-label">Streaming Line:</span>
          <span className="info-value">{streamingLine.toFixed(1)}</span>
        </div>
        <div className="info-item">
          <Calendar size={14} />
          <span className="info-label">Period:</span>
          <div className="period-pills">
            {TIME_PERIODS.map(period => (
              <button
                key={period.value}
                className={`period-pill ${comparisonPeriod === period.value ? 'active' : ''}`}
                onClick={() => setComparisonPeriod(period.value)}
              >
                {period.label}
              </button>
            ))}
          </div>
        </div>
        {viewMode === 'freeAgents' && (
          <label className="hide-injured-toggle">
            <input
              type="checkbox"
              checked={hideInjured}
              onChange={e => setHideInjured(e.target.checked)}
            />
            <span>Hide injured (OUT/IR)</span>
          </label>
        )}
      </div>

      {/* Results count */}
      <div className="results-count">
        Showing {filteredPlayers.length} {viewMode === 'freeAgents' ? 'free agents' : viewMode === 'dropCandidates' ? 'drop candidates' : 'players'}
        {hideInjured && viewMode === 'freeAgents' && freeAgentPlayers.length !== healthyFreeAgents.length && (
          <span className="injured-hidden"> ({freeAgentPlayers.length - healthyFreeAgents.length} injured hidden)</span>
        )}
        <span className="select-hint"> • Click checkbox to select for comparison</span>
      </div>

      {/* Comparison Panel */}
      <AnimatePresence>
        {showComparison && selectedPlayers.length > 0 && (
          <motion.div
            className="comparison-panel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="comparison-header">
              <h3>
                <BarChart3 size={18} />
                Player Comparison
              </h3>
              <div className="comparison-controls">
                <div className="time-period-selector">
                  <Calendar size={14} />
                  {TIME_PERIODS.map(period => (
                    <button
                      key={period.value}
                      className={`period-btn ${comparisonPeriod === period.value ? 'active' : ''}`}
                      onClick={() => setComparisonPeriod(period.value)}
                    >
                      {period.label}
                    </button>
                  ))}
                </div>
                <button className="btn btn-ghost" onClick={() => setShowComparison(false)}>
                  <X size={16} />
                  Close
                </button>
              </div>
            </div>

            <div className="comparison-charts">
              {/* Bar Chart - Lock-In Comparison */}
              <div className="chart-card">
                <h4>Lock-In Value Comparison</h4>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={comparisonBarData} layout="vertical">
                    <XAxis type="number" stroke="var(--text-muted)" fontSize={10} tickLine={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      stroke="var(--text-muted)"
                      fontSize={11}
                      tickLine={false}
                      width={70}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '6px',
                        fontSize: '12px',
                        color: 'var(--text-primary)',
                      }}
                      formatter={(value) => [typeof value === 'number' ? value.toFixed(1) : '0', 'Lock-In']}
                    />
                    <Bar dataKey="lockin" name="Lock-In" radius={[0, 4, 4, 0]}>
                      {comparisonBarData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Line Chart - Weekly Performance */}
              <div className="chart-card">
                <h4>Weekly Performance</h4>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={weeklyLineData}>
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
                    {selectedPlayers.map((player, idx) => (
                      <Line
                        key={player.sleeper_id}
                        type="monotone"
                        dataKey={player.player.split(' ').pop() || player.player}
                        stroke={CHART_COLORS[idx]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Radar Chart - Overall Comparison */}
              {selectedPlayers.length >= 2 && (
                <div className="chart-card full-width">
                  <h4>Overall Profile Comparison</h4>
                  <ResponsiveContainer width="100%" height={300}>
                    <RadarChart data={comparisonRadarData}>
                      <PolarGrid stroke="var(--border-subtle)" />
                      <PolarAngleAxis dataKey="stat" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                      <PolarRadiusAxis tick={false} axisLine={false} />
                      {selectedPlayers.map((player, idx) => (
                        <Radar
                          key={player.sleeper_id}
                          name={player.player.split(' ').pop() || player.player}
                          dataKey={player.player.split(' ').pop() || player.player}
                          stroke={CHART_COLORS[idx]}
                          fill={CHART_COLORS[idx]}
                          fillOpacity={0.15}
                        />
                      ))}
                      <Legend />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Stats Table */}
              <div className="chart-card full-width">
                <h4>Detailed Stats ({periodConfig.label})</h4>
                <table className="comparison-stats-table">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Lock-In</th>
                      <th>Avg FPTS</th>
                      <th>Ceiling</th>
                      <th>Floor</th>
                      <th>40+%</th>
                      <th>Rel</th>
                      <th>Avg Min</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPlayers.map((player, idx) => {
                      const stats = calcPlayerStats(player, periodConfig.weeks);
                      return (
                        <tr key={player.sleeper_id}>
                          <td>
                            <span className="player-color" style={{ background: CHART_COLORS[idx] }} />
                            {player.player}
                          </td>
                          <td className="primary">{stats.expectedLockin.toFixed(1)}</td>
                          <td>{stats.avgFpts.toFixed(1)}</td>
                          <td className="ceiling">{stats.ceiling.toFixed(1)}</td>
                          <td className="floor">{stats.floor.toFixed(1)}</td>
                          <td>{stats.pct40plus.toFixed(0)}%</td>
                          <td>{stats.reliability.toFixed(0)}</td>
                          <td>{stats.avgMinutes.toFixed(0)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table */}
      <div className="card table-card">
        <div className="table-wrapper">
          <table className="data-table players-table streaming-table">
            <thead>
              <tr>
                <th className="checkbox-col"></th>
                <th>Player</th>
                <th>Team</th>
                <th>Pos</th>
                <th title="Games remaining this week" className="games-left-header">Left</th>
                <th className="sortable" onClick={() => handleSort('totalGames')}>
                  GP <SortIcon column="totalGames" />
                </th>
                <th className="sortable" onClick={() => handleSort('expectedLockin')}>
                  Season <SortIcon column="expectedLockin" />
                </th>
                <th>L2W</th>
                <th>L4W</th>
                <th className="sortable" onClick={() => handleSort('lockinCeiling')}>
                  Ceil <SortIcon column="lockinCeiling" />
                </th>
                <th className="sortable" onClick={() => handleSort('lockinFloor')}>
                  Floor <SortIcon column="lockinFloor" />
                </th>
                <th title="% weeks with 40+ game">40+%</th>
                <th title="% weeks with 45+ game">45+%</th>
                <th title="Reliability score">Rel</th>
                <th title="Short-term momentum">Δ2v4</th>
                <th title="Medium-term trend">Δ4v8</th>
              </tr>
            </thead>
            <tbody>
              {filteredPlayers.map(player => {
                const isSelected = selectedPlayers.some(p => p.sleeper_id === player.sleeper_id);
                const colorIdx = selectedPlayers.findIndex(p => p.sleeper_id === player.sleeper_id);
                const isFreeAgent = !rosteredPlayerIds.has(player.sleeper_id);
                const isBelowLine = player.expectedLockin < streamingLine;
                const trends = calcTrends(player);
                const remainingGames = getRemainingGames(player.nba_team, nbaSchedule);
                const stats = calcPlayerStats(player, 99);

                const formatTrend = (val: number | null) => {
                  if (val === null) return <span className="trend-na">—</span>;
                  const cls = val > 5 ? 'trend-up' : val < -5 ? 'trend-down' : 'trend-flat';
                  return (
                    <span className={`trend-value ${cls}`}>
                      {val > 0 ? '+' : ''}{val.toFixed(0)}%
                    </span>
                  );
                };

                const formatLockin = (val: number | null) => {
                  if (val === null) return <span className="trend-na">—</span>;
                  return val.toFixed(1);
                };

                return (
                  <tr
                    key={player.sleeper_id}
                    className={`${isSelected ? 'selected' : ''} ${isFreeAgent ? 'free-agent-row' : ''} ${isBelowLine && !isFreeAgent ? 'below-line-row' : ''}`}
                  >
                    <td className="checkbox-col">
                      <label className="checkbox-wrapper">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => togglePlayerSelection(player)}
                          disabled={!isSelected && selectedPlayers.length >= 6}
                        />
                        {isSelected && (
                          <span className="color-indicator" style={{ background: CHART_COLORS[colorIdx] }} />
                        )}
                      </label>
                    </td>
                    <td onClick={() => onPlayerSelect(player)}>
                      <div className="player-cell">
                        <span className="player-name">
                          {player.player}
                          {isFreeAgent && <span className="fa-badge">FA</span>}
                        </span>
                        {player.injury_status && (
                          <span className={`injury-badge ${player.injury_status.toLowerCase()}`}>
                            {player.injury_status}
                          </span>
                        )}
                      </div>
                    </td>
                    <td onClick={() => onPlayerSelect(player)}>
                      <div className="team-cell">
                        <span className="nba-team">{player.nba_team}</span>
                        <span className="fantasy-team">
                          {isFreeAgent ? 'Free Agent' : player.fantasy_team}
                        </span>
                      </div>
                    </td>
                    <td onClick={() => onPlayerSelect(player)}>
                      <span className="player-position">{player.position}</span>
                    </td>
                    <td onClick={() => onPlayerSelect(player)} className="games-left-cell">
                      <span
                        className={`games-left-badge ${remainingGames.count >= 4 ? 'hot' : remainingGames.count >= 3 ? 'good' : remainingGames.count >= 2 ? 'ok' : remainingGames.count >= 1 ? 'low' : 'none'}`}
                        title={remainingGames.games.map(g => `${g.date.slice(5)}: ${g.home ? 'vs' : '@'} ${g.opponent}`).join('\n')}
                      >
                        {remainingGames.count}
                      </span>
                    </td>
                    <td onClick={() => onPlayerSelect(player)}>{player.totalGames}</td>
                    <td onClick={() => onPlayerSelect(player)} className="stat-highlight positive">
                      {player.expectedLockin.toFixed(1)}
                    </td>
                    <td onClick={() => onPlayerSelect(player)} className="lockin-cell">
                      {formatLockin(trends.l2w)}
                    </td>
                    <td onClick={() => onPlayerSelect(player)} className="lockin-cell">
                      {formatLockin(trends.l4w)}
                    </td>
                    <td onClick={() => onPlayerSelect(player)} className="stat-highlight neutral">
                      {player.lockinCeiling.toFixed(1)}
                    </td>
                    <td onClick={() => onPlayerSelect(player)}>{player.lockinFloor.toFixed(1)}</td>
                    <td onClick={() => onPlayerSelect(player)}>
                      <span className={`pct-badge ${stats.pct40plus >= 80 ? 'high' : stats.pct40plus >= 50 ? 'med' : 'low'}`}>
                        {stats.pct40plus.toFixed(0)}
                      </span>
                    </td>
                    <td onClick={() => onPlayerSelect(player)}>
                      <span className={`pct-badge ${stats.pct45plus >= 60 ? 'high' : stats.pct45plus >= 30 ? 'med' : 'low'}`}>
                        {stats.pct45plus.toFixed(0)}
                      </span>
                    </td>
                    <td onClick={() => onPlayerSelect(player)}>
                      <span className={`reliability-badge ${stats.reliability >= 70 ? 'high' : stats.reliability >= 45 ? 'med' : 'low'}`}>
                        {stats.reliability.toFixed(0)}
                      </span>
                    </td>
                    <td onClick={() => onPlayerSelect(player)}>
                      {formatTrend(trends.delta2v4)}
                    </td>
                    <td onClick={() => onPlayerSelect(player)}>
                      {formatTrend(trends.delta4v8)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}

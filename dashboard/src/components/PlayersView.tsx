import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  SortAsc,
  BarChart3,
  X,
  Calendar,
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
import type { PlayerAnalytics } from '../types';
import type { NBASchedule } from '../lib/dataLoader';
import {
  filterByWeeks,
  calcPlayerPeriodStats,
  calcPlayerTrends,
  getRemainingGames,
  getTrendClass,
  TIME_PERIODS,
  CHART_COLORS,
  type TimePeriod,
} from '../lib/analytics';
import './PlayersView.css';

interface Props {
  players: PlayerAnalytics[];
  weekFilter: number[];
  onWeekFilterChange: (weeks: number[]) => void;
  onPlayerSelect: (player: PlayerAnalytics) => void;
  nbaSchedule: NBASchedule | null;
}

type SortKey = 'expectedLockin' | 'avgFpts' | 'lockinCeiling' | 'lockinFloor' | 'avgMinutes' | 'totalGames' | 'lockinTrendPct' | 'pct40plus' | 'pct45plus' | 'pctBust' | 'reliability' | 'l2w' | 'l4w' | 'delta2v4' | 'delta4v8' | 'gamesLeft';
type SortDir = 'asc' | 'desc';

// Use shared calculation utilities from analytics.ts
const calcPlayerStats = calcPlayerPeriodStats;
const calcTrends = calcPlayerTrends;

export default function PlayersView({ players, weekFilter, onWeekFilterChange, onPlayerSelect, nbaSchedule }: Props) {
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState<string>('');
  const [positionFilter, setPositionFilter] = useState<string>('');
  const [sortKey, setSortKey] = useState<SortKey>('expectedLockin');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedPlayers, setSelectedPlayers] = useState<PlayerAnalytics[]>([]);
  const [showComparison, setShowComparison] = useState(false);
  const [comparisonPeriod, setComparisonPeriod] = useState<TimePeriod>('all');
  const [tablePeriod, setTablePeriod] = useState<TimePeriod>('all');

  const periodConfig = TIME_PERIODS.find(p => p.value === comparisonPeriod)!;
  const tablePeriodConfig = TIME_PERIODS.find(p => p.value === tablePeriod)!;

  // Get unique teams and positions
  const fantasyTeams = useMemo(() => [...new Set(players.map(p => p.fantasy_team))].sort(), [players]);
  const positions = useMemo(() => [...new Set(players.map(p => p.position))].sort(), [players]);

  // Filter and sort players with period stats
  const filteredPlayers = useMemo(() => {
    let result = weekFilter.length > 0 ? filterByWeeks(players, weekFilter) : players;

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(p =>
        p.player.toLowerCase().includes(searchLower) ||
        p.nba_team.toLowerCase().includes(searchLower) ||
        p.fantasy_team.toLowerCase().includes(searchLower)
      );
    }

    // Team filter
    if (teamFilter) {
      result = result.filter(p => p.fantasy_team === teamFilter);
    }

    // Position filter
    if (positionFilter) {
      result = result.filter(p => p.position === positionFilter);
    }

    // Calculate period stats for each player
    const playersWithPeriodStats = result.map(p => {
      const periodStats = calcPlayerStats(p, tablePeriodConfig.weeks);
      return {
        ...p,
        periodExpectedLockin: periodStats.expectedLockin,
        periodAvgFpts: periodStats.avgFpts,
        periodCeiling: periodStats.ceiling,
        periodFloor: periodStats.floor,
        periodPct40plus: periodStats.pct40plus,
        periodPct45plus: periodStats.pct45plus,
        periodPctBust: periodStats.pctBust,
        periodReliability: periodStats.reliability,
        periodAvgMinutes: periodStats.avgMinutes,
      };
    });

    // Sort based on period values when period is selected
    return [...playersWithPeriodStats].sort((a, b) => {
      let aVal: number, bVal: number;

      // Handle computed sort keys
      if (sortKey === 'l2w' || sortKey === 'l4w' || sortKey === 'delta2v4' || sortKey === 'delta4v8') {
        const aTrends = calcTrends(a);
        const bTrends = calcTrends(b);
        aVal = aTrends[sortKey] ?? -Infinity;
        bVal = bTrends[sortKey] ?? -Infinity;
      } else if (sortKey === 'pct40plus') {
        aVal = a.periodPct40plus;
        bVal = b.periodPct40plus;
      } else if (sortKey === 'pct45plus') {
        aVal = a.periodPct45plus;
        bVal = b.periodPct45plus;
      } else if (sortKey === 'pctBust') {
        aVal = a.periodPctBust;
        bVal = b.periodPctBust;
      } else if (sortKey === 'reliability') {
        aVal = a.periodReliability;
        bVal = b.periodReliability;
      } else if (sortKey === 'gamesLeft') {
        aVal = getRemainingGames(a.nba_team, nbaSchedule, a).count;
        bVal = getRemainingGames(b.nba_team, nbaSchedule, b).count;
      } else if (tablePeriod !== 'all') {
        // Use period-specific values for sorting
        switch (sortKey) {
          case 'expectedLockin':
            aVal = a.periodExpectedLockin;
            bVal = b.periodExpectedLockin;
            break;
          case 'avgFpts':
            aVal = a.periodAvgFpts;
            bVal = b.periodAvgFpts;
            break;
          case 'lockinCeiling':
            aVal = a.periodCeiling;
            bVal = b.periodCeiling;
            break;
          case 'lockinFloor':
            aVal = a.periodFloor;
            bVal = b.periodFloor;
            break;
          case 'avgMinutes':
            aVal = a.periodAvgMinutes;
            bVal = b.periodAvgMinutes;
            break;
          default:
            aVal = a[sortKey] as number;
            bVal = b[sortKey] as number;
        }
      } else {
        aVal = a[sortKey] as number;
        bVal = b[sortKey] as number;
      }
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }, [players, weekFilter, search, teamFilter, positionFilter, sortKey, sortDir, tablePeriod, tablePeriodConfig.weeks, nbaSchedule]);

  // Calculate position rankings based on lock-in for the selected period
  const positionRankings = useMemo(() => {
    // First calculate period stats for ALL players (not just filtered)
    const allWithPeriodStats = players.map(p => {
      const periodStats = calcPlayerStats(p, tablePeriodConfig.weeks);
      return {
        sleeper_id: p.sleeper_id,
        position: p.position,
        periodExpectedLockin: periodStats.expectedLockin,
      };
    });

    // Group by position and sort by lock-in
    const byPosition: Record<string, typeof allWithPeriodStats> = {};
    for (const p of allWithPeriodStats) {
      if (!byPosition[p.position]) byPosition[p.position] = [];
      byPosition[p.position].push(p);
    }

    // Sort each position and assign ranks
    const rankings: Record<string, number> = {};
    for (const pos in byPosition) {
      byPosition[pos].sort((a, b) => b.periodExpectedLockin - a.periodExpectedLockin);
      byPosition[pos].forEach((p, idx) => {
        rankings[p.sleeper_id] = idx + 1;
      });
    }
    return rankings;
  }, [players, tablePeriodConfig.weeks]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const toggleWeek = (week: number) => {
    if (weekFilter.includes(week)) {
      onWeekFilterChange(weekFilter.filter(w => w !== week));
    } else {
      onWeekFilterChange([...weekFilter, week]);
    }
  };

  const clearWeekFilter = () => {
    onWeekFilterChange([]);
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
      { stat: 'Lock-In', ...Object.fromEntries(selectedPlayers.map(p => [p.player.split(' ').pop(), (calcPlayerStats(p, periodConfig.weeks).expectedLockin / maxLockin) * 100])) },
      { stat: 'Ceiling', ...Object.fromEntries(selectedPlayers.map(p => [p.player.split(' ').pop(), (calcPlayerStats(p, periodConfig.weeks).ceiling / maxCeiling) * 100])) },
      { stat: 'Floor', ...Object.fromEntries(selectedPlayers.map(p => [p.player.split(' ').pop(), (calcPlayerStats(p, periodConfig.weeks).floor / maxCeiling) * 100])) },
      { stat: 'Reliability', ...Object.fromEntries(selectedPlayers.map(p => [p.player.split(' ').pop(), calcPlayerStats(p, periodConfig.weeks).reliability])) },
      { stat: 'Minutes', ...Object.fromEntries(selectedPlayers.map(p => [p.player.split(' ').pop(), (calcPlayerStats(p, periodConfig.weeks).avgMinutes / maxMinutes) * 100])) },
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
      className="players-view"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Filters */}
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

        <div className="time-period-selector">
          <Calendar size={14} />
          {TIME_PERIODS.map(period => (
            <button
              key={period.value}
              className={`period-btn ${tablePeriod === period.value ? 'active' : ''}`}
              onClick={() => setTablePeriod(period.value)}
            >
              {period.label}
            </button>
          ))}
        </div>

        <select
          className="input select"
          value={teamFilter}
          onChange={e => setTeamFilter(e.target.value)}
        >
          <option value="">All Teams</option>
          {fantasyTeams.map(team => (
            <option key={team} value={team}>{team}</option>
          ))}
        </select>

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

      {/* Week Filter */}
      <div className="week-filter">
        <div className="week-filter-header">
          <Filter size={16} />
          <span>Filter by Week</span>
          {weekFilter.length > 0 && (
            <button className="btn btn-ghost clear-btn" onClick={clearWeekFilter}>
              Clear ({weekFilter.length})
            </button>
          )}
        </div>
        <div className="week-pills">
          {Array.from({ length: 13 }, (_, i) => i + 1).map(week => (
            <button
              key={week}
              className={`week-pill ${weekFilter.includes(week) ? 'active' : ''}`}
              onClick={() => toggleWeek(week)}
            >
              W{week}
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      <div className="results-count">
        Showing {filteredPlayers.length} of {players.length} players
        {weekFilter.length > 0 && ` (Weeks: ${weekFilter.sort((a, b) => a - b).join(', ')})`}
        <span className="select-hint"> • Click checkbox to select players for comparison</span>
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
          <table className="data-table players-table">
            <thead>
              <tr>
                <th className="checkbox-col"></th>
                <th>Player</th>
                <th>Team</th>
                <th>Pos</th>
                <th title="Games remaining this week" className="sortable games-left-header" onClick={() => handleSort('gamesLeft')}>
                  Left <SortIcon column="gamesLeft" />
                </th>
                <th className="sortable" onClick={() => handleSort('totalGames')}>
                  GP <SortIcon column="totalGames" />
                </th>
                <th className="sortable" onClick={() => handleSort('expectedLockin')}>
                  Exp Lock-In <SortIcon column="expectedLockin" />
                </th>
                <th className="sortable" onClick={() => handleSort('avgFpts')}>
                  Avg FPTS <SortIcon column="avgFpts" />
                </th>
                <th className="sortable" onClick={() => handleSort('lockinCeiling')}>
                  Ceiling <SortIcon column="lockinCeiling" />
                </th>
                <th className="sortable" onClick={() => handleSort('lockinFloor')}>
                  Floor <SortIcon column="lockinFloor" />
                </th>
                <th title="% of weeks with a 40+ game (playable)" className="sortable" onClick={() => handleSort('pct40plus')}>
                  40+% <SortIcon column="pct40plus" />
                </th>
                <th title="% of weeks with a 45+ game (confident lock)" className="sortable" onClick={() => handleSort('pct45plus')}>
                  45+% <SortIcon column="pct45plus" />
                </th>
                <th title="% of weeks under 35 (bust rate)" className="sortable" onClick={() => handleSort('pctBust')}>
                  Bust% <SortIcon column="pctBust" />
                </th>
                <th title="Reliability score: playable rate + lock rate - bust rate" className="sortable" onClick={() => handleSort('reliability')}>
                  Rel <SortIcon column="reliability" />
                </th>
                <th title="Lock-In average last 2 weeks" className="sortable" onClick={() => handleSort('l2w')}>
                  L2W <SortIcon column="l2w" />
                </th>
                <th title="Lock-In average last 4 weeks" className="sortable" onClick={() => handleSort('l4w')}>
                  L4W <SortIcon column="l4w" />
                </th>
                <th title="Short-term momentum: L2W vs weeks 3-4 ago" className="sortable trend-header" onClick={() => handleSort('delta2v4')}>
                  Δ2v4 <SortIcon column="delta2v4" />
                </th>
                <th title="Medium-term trend: L4W vs weeks 5-8 ago" className="sortable trend-header" onClick={() => handleSort('delta4v8')}>
                  Δ4v8 <SortIcon column="delta4v8" />
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredPlayers.map(player => {
                const isSelected = selectedPlayers.some(p => p.sleeper_id === player.sleeper_id);
                const colorIdx = selectedPlayers.findIndex(p => p.sleeper_id === player.sleeper_id);
                const trends = calcTrends(player);
                const remainingGames = getRemainingGames(player.nba_team, nbaSchedule, player);
                // Use period stats that are already calculated
                const pct40plus = player.periodPct40plus;
                const pct45plus = player.periodPct45plus;
                const pctBust = player.periodPctBust;
                const reliability = player.periodReliability;
                return (
                  <tr
                    key={player.sleeper_id}
                    className={isSelected ? 'selected' : ''}
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
                        <span className="player-name">{player.player}</span>
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
                        <span className="fantasy-team">{player.fantasy_team}</span>
                      </div>
                    </td>
                    <td onClick={() => onPlayerSelect(player)}>
                      <span className="player-position">
                        {player.position}
                        <span className="position-rank">#{positionRankings[player.sleeper_id]}</span>
                      </span>
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
                    <td onClick={() => onPlayerSelect(player)} className="stat-highlight positive">{player.periodExpectedLockin.toFixed(1)}</td>
                    <td onClick={() => onPlayerSelect(player)}>{player.periodAvgFpts.toFixed(1)}</td>
                    <td onClick={() => onPlayerSelect(player)} className="stat-highlight neutral">{player.periodCeiling.toFixed(1)}</td>
                    <td onClick={() => onPlayerSelect(player)}>{player.periodFloor.toFixed(1)}</td>
                    <td onClick={() => onPlayerSelect(player)}>
                      <span className={`pct-badge ${pct40plus >= 80 ? 'high' : pct40plus >= 50 ? 'med' : 'low'}`}>
                        {pct40plus.toFixed(0)}
                      </span>
                    </td>
                    <td onClick={() => onPlayerSelect(player)}>
                      <span className={`pct-badge ${pct45plus >= 60 ? 'high' : pct45plus >= 30 ? 'med' : 'low'}`}>
                        {pct45plus.toFixed(0)}
                      </span>
                    </td>
                    <td onClick={() => onPlayerSelect(player)}>
                      <span className={`pct-badge bust ${pctBust === 0 ? 'none' : pctBust <= 15 ? 'low' : pctBust <= 30 ? 'med' : 'high'}`}>
                        {pctBust.toFixed(0)}
                      </span>
                    </td>
                    <td onClick={() => onPlayerSelect(player)}>
                      <span className={`reliability-badge ${reliability >= 70 ? 'high' : reliability >= 45 ? 'med' : 'low'}`}>
                        {reliability.toFixed(0)}
                      </span>
                    </td>
                    <td onClick={() => onPlayerSelect(player)} className="trend-value-cell">
                      {trends.l2w !== null ? trends.l2w.toFixed(1) : '-'}
                    </td>
                    <td onClick={() => onPlayerSelect(player)} className="trend-value-cell">
                      {trends.l4w !== null ? trends.l4w.toFixed(1) : '-'}
                    </td>
                    <td onClick={() => onPlayerSelect(player)}>
                      <span className={`trend-value ${getTrendClass(trends.delta2v4)}`}>
                        {trends.delta2v4 !== null ? (
                          <>
                            {trends.delta2v4 >= 0 ? '+' : ''}{trends.delta2v4.toFixed(0)}%
                          </>
                        ) : '-'}
                      </span>
                    </td>
                    <td onClick={() => onPlayerSelect(player)}>
                      <span className={`trend-value ${getTrendClass(trends.delta4v8)}`}>
                        {trends.delta4v8 !== null ? (
                          <>
                            {trends.delta4v8 >= 0 ? '+' : ''}{trends.delta4v8.toFixed(0)}%
                          </>
                        ) : '-'}
                      </span>
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

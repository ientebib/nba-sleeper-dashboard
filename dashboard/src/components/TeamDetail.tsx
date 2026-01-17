import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  Target,
  Activity,
  Calendar,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import type { TeamAnalytics, PlayerAnalytics } from '../types';
import { calcPlayerPeriodStats } from '../lib/analytics';
import './TeamDetail.css';

interface Props {
  team: TeamAnalytics;
  allPlayers: PlayerAnalytics[];
  onBack: () => void;
  onPlayerSelect: (player: PlayerAnalytics) => void;
}

type TimePeriod = 'all' | 'L3W' | 'L4W' | 'L5W' | 'L6W' | 'L8W' | 'custom';
type SortKey = 'lockin' | 'avg' | 'ceiling' | 'floor' | 'minutes' | 'minTrend' | 'lockinTrend';
type SortDir = 'asc' | 'desc';

const TIME_PERIODS: { value: TimePeriod; label: string; weeks: number }[] = [
  { value: 'all', label: 'Season', weeks: 99 },
  { value: 'L3W', label: '3W', weeks: 3 },
  { value: 'L4W', label: '4W', weeks: 4 },
  { value: 'L5W', label: '5W', weeks: 5 },
  { value: 'L6W', label: '6W', weeks: 6 },
  { value: 'L8W', label: '8W', weeks: 8 },
];

// Use shared calculation utility from analytics.ts
// Wrapper to add minutes trend calculation (specific to TeamDetail)
function calcPlayerStats(player: PlayerAnalytics, maxWeeks: number, customRange?: { start: number; end: number }) {
  // Handle custom range by filtering weeks manually, then use shared calculation
  const currentWeek = Math.max(...player.weeklyStats.map(w => w.week));

  let filteredWeeks;
  if (customRange) {
    filteredWeeks = player.weeklyStats.filter(w => w.week >= customRange.start && w.week <= customRange.end);
  } else {
    const minWeek = maxWeeks === 99 ? 1 : currentWeek - maxWeeks + 1;
    filteredWeeks = player.weeklyStats.filter(w => w.week >= minWeek);
  }

  if (filteredWeeks.length === 0) {
    return { expectedLockin: 0, avgFpts: 0, ceiling: 0, floor: 0, avgMinutes: 0, games: 0, weeksPlayed: 0, minutesTrendPct: 0 };
  }

  // Use shared calculation for core stats
  const stats = calcPlayerPeriodStats(player, maxWeeks);

  // Calculate minutes trend (compare recent vs earlier in period) - specific to TeamDetail
  const midPoint = Math.floor(filteredWeeks.length / 2);
  const earlyMinutes = filteredWeeks.slice(0, midPoint).map(w => w.avgMinutes);
  const recentMinutes = filteredWeeks.slice(midPoint).map(w => w.avgMinutes);
  const earlyAvg = earlyMinutes.length > 0 ? earlyMinutes.reduce((a, b) => a + b, 0) / earlyMinutes.length : 0;
  const recentAvg = recentMinutes.length > 0 ? recentMinutes.reduce((a, b) => a + b, 0) / recentMinutes.length : 0;
  const minutesTrendPct = earlyAvg > 0 ? ((recentAvg - earlyAvg) / earlyAvg) * 100 : 0;

  return {
    expectedLockin: stats.expectedLockin,
    avgFpts: stats.avgFpts,
    ceiling: stats.ceiling,
    floor: stats.floor,
    avgMinutes: stats.avgMinutes,
    games: stats.games,
    weeksPlayed: stats.weeks,
    minutesTrendPct,
  };
}

export default function TeamDetail({ team, onBack, onPlayerSelect }: Props) {
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('all');
  const [customRange, setCustomRange] = useState({ start: 1, end: 13 });
  const [showCustom, setShowCustom] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('lockin');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const periodConfig = TIME_PERIODS.find(p => p.value === timePeriod) || TIME_PERIODS[0];
  const maxWeek = Math.max(...team.players.flatMap(p => p.weeklyStats.map(w => w.week)));

  // Get team players with period stats
  const teamPlayers = useMemo(() => {
    const playersWithStats = team.players.map(p => ({
      ...p,
      periodStats: calcPlayerStats(p, periodConfig.weeks, timePeriod === 'custom' ? customRange : undefined),
    }));

    // Sort based on selected column
    return playersWithStats.sort((a, b) => {
      let aVal: number, bVal: number;
      switch (sortKey) {
        case 'lockin':
          aVal = a.periodStats.expectedLockin;
          bVal = b.periodStats.expectedLockin;
          break;
        case 'avg':
          aVal = a.periodStats.avgFpts;
          bVal = b.periodStats.avgFpts;
          break;
        case 'ceiling':
          aVal = a.periodStats.ceiling;
          bVal = b.periodStats.ceiling;
          break;
        case 'floor':
          aVal = a.periodStats.floor;
          bVal = b.periodStats.floor;
          break;
        case 'minutes':
          aVal = a.periodStats.avgMinutes;
          bVal = b.periodStats.avgMinutes;
          break;
        case 'minTrend':
          aVal = a.periodStats.minutesTrendPct || 0;
          bVal = b.periodStats.minutesTrendPct || 0;
          break;
        case 'lockinTrend':
          aVal = a.lockinTrendPct;
          bVal = b.lockinTrendPct;
          break;
        default:
          aVal = a.periodStats.expectedLockin;
          bVal = b.periodStats.expectedLockin;
      }
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }, [team.players, timePeriod, customRange, periodConfig.weeks, sortKey, sortDir]);

  // Handle sort click
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  // Sort header component
  const SortHeader = ({ label, sortKeyName }: { label: string; sortKeyName: SortKey }) => {
    const isActive = sortKey === sortKeyName;
    return (
      <span className={`sortable ${isActive ? 'active' : ''}`} onClick={() => handleSort(sortKeyName)}>
        {label}
        {isActive ? (
          sortDir === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />
        ) : (
          <ArrowUpDown size={10} />
        )}
      </span>
    );
  };

  // Top 10 starters and bench
  const starters = teamPlayers.slice(0, 10);
  const bench = teamPlayers.slice(10);

  // Team totals for period
  const teamTotals = useMemo(() => {
    const starterStats = starters.map(p => p.periodStats);
    return {
      totalLockin: starterStats.reduce((sum, s) => sum + s.expectedLockin, 0),
      avgPerStarter: starterStats.reduce((sum, s) => sum + s.expectedLockin, 0) / starters.length,
      totalCeiling: starterStats.reduce((sum, s) => sum + s.ceiling, 0),
      totalFloor: starterStats.reduce((sum, s) => sum + s.floor, 0),
    };
  }, [starters]);

  // Weekly performance chart data
  const weeklyData = useMemo(() => {
    const currentWeek = maxWeek;
    let startWeek: number;
    let endWeek: number;

    if (timePeriod === 'custom') {
      startWeek = customRange.start;
      endWeek = customRange.end;
    } else {
      startWeek = periodConfig.weeks === 99 ? 1 : currentWeek - periodConfig.weeks + 1;
      endWeek = currentWeek;
    }

    const weeks: { week: string; lockin: number; avg: number }[] = [];

    for (let w = Math.max(1, startWeek); w <= endWeek; w++) {
      let totalMax = 0;
      let totalAvg = 0;

      // Get top 10 players' performance for this week
      const weekScores = teamPlayers.map(player => {
        const weekData = player.weeklyStats.find(ws => ws.week === w);
        return weekData?.maxFpts || 0;
      }).sort((a, b) => b - a);

      totalMax = weekScores.slice(0, 10).reduce((a, b) => a + b, 0);

      const weekAvgs = teamPlayers.map(player => {
        const weekData = player.weeklyStats.find(ws => ws.week === w);
        return weekData?.avgFpts || 0;
      }).sort((a, b) => b - a);

      totalAvg = weekAvgs.slice(0, 10).reduce((a, b) => a + b, 0);

      weeks.push({
        week: `W${w}`,
        lockin: Number(totalMax.toFixed(1)),
        avg: Number(totalAvg.toFixed(1)),
      });
    }

    return weeks;
  }, [teamPlayers, timePeriod, customRange, periodConfig.weeks, maxWeek]);

  // Player rankings chart (top 10)
  const playerChartData = starters.map(p => ({
    name: p.player.split(' ').pop() || p.player,
    lockin: Number(p.periodStats.expectedLockin.toFixed(1)),
    trend: p.lockinTrend,
  }));

  const getTrendIcon = (trend: string, size: number = 12) => {
    switch (trend) {
      case 'RISING': return <TrendingUp size={size} />;
      case 'FALLING': return <TrendingDown size={size} />;
      default: return <Minus size={size} />;
    }
  };

  const getMinutesTrendClass = (pct: number) => {
    if (pct > 5) return 'rising';
    if (pct < -5) return 'falling';
    return 'stable';
  };

  return (
    <motion.div
      className="team-detail"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Header */}
      <div className="team-detail-header">
        <button className="back-btn" onClick={onBack}>
          <ArrowLeft size={18} />
          Back
        </button>
        <div className="team-info">
          <h1>{team.teamName}</h1>
          <div className="team-meta">
            <span className="owner">{team.ownerName}</span>
            <span className="record">
              <span className="wins">{team.wins}</span>-<span className="losses">{team.losses}</span>
            </span>
          </div>
        </div>
        <div className="time-period-controls">
          <div className="time-period-selector">
            <Calendar size={14} />
            {TIME_PERIODS.map(period => (
              <button
                key={period.value}
                className={`period-btn ${timePeriod === period.value ? 'active' : ''}`}
                onClick={() => { setTimePeriod(period.value); setShowCustom(false); }}
              >
                {period.label}
              </button>
            ))}
            <button
              className={`period-btn ${timePeriod === 'custom' ? 'active' : ''}`}
              onClick={() => setShowCustom(!showCustom)}
            >
              Custom <ChevronDown size={12} />
            </button>
          </div>
          {showCustom && (
            <div className="custom-range-picker">
              <label>
                From Week
                <select
                  value={customRange.start}
                  onChange={e => {
                    setCustomRange(prev => ({ ...prev, start: Number(e.target.value) }));
                    setTimePeriod('custom');
                  }}
                >
                  {Array.from({ length: maxWeek }, (_, i) => (
                    <option key={i + 1} value={i + 1}>W{i + 1}</option>
                  ))}
                </select>
              </label>
              <label>
                To Week
                <select
                  value={customRange.end}
                  onChange={e => {
                    setCustomRange(prev => ({ ...prev, end: Number(e.target.value) }));
                    setTimePeriod('custom');
                  }}
                >
                  {Array.from({ length: maxWeek }, (_, i) => (
                    <option key={i + 1} value={i + 1}>W{i + 1}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="team-kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon">
            <Target size={20} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Starter Lock-In</span>
            <span className="kpi-value">{teamTotals.totalLockin.toFixed(0)}</span>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon">
            <Activity size={20} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Avg per Starter</span>
            <span className="kpi-value">{teamTotals.avgPerStarter.toFixed(1)}</span>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon ceiling">
            <TrendingUp size={20} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Ceiling</span>
            <span className="kpi-value">{teamTotals.totalCeiling.toFixed(0)}</span>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon floor">
            <TrendingDown size={20} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Floor</span>
            <span className="kpi-value">{teamTotals.totalFloor.toFixed(0)}</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="team-detail-grid">
        {/* Weekly Performance Chart */}
        <div className="detail-card">
          <h3>Weekly Performance</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={weeklyData}>
              <defs>
                <linearGradient id="colorLockin" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
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
              <Area
                type="monotone"
                dataKey="lockin"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#colorLockin)"
                name="Lock-In Total"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Player Rankings Chart */}
        <div className="detail-card">
          <h3>Starter Rankings</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={playerChartData} layout="vertical">
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
              />
              <Bar dataKey="lockin" name="Lock-In" radius={[0, 4, 4, 0]}>
                {playerChartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.trend === 'RISING' ? '#10b981' : entry.trend === 'FALLING' ? '#ef4444' : '#6366f1'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Full Roster Table - Starters */}
      <div className="detail-card roster-card">
        <h3>
          <Users size={16} />
          Starters (Top 10)
        </h3>
        <div className="roster-table">
          <div className="roster-header">
            <span>Player</span>
            <SortHeader label="Lock-In" sortKeyName="lockin" />
            <SortHeader label="Avg" sortKeyName="avg" />
            <SortHeader label="Ceiling" sortKeyName="ceiling" />
            <SortHeader label="Floor" sortKeyName="floor" />
            <SortHeader label="Min" sortKeyName="minutes" />
            <SortHeader label="Min Trend" sortKeyName="minTrend" />
            <SortHeader label="Lock-In Trend" sortKeyName="lockinTrend" />
          </div>
          {starters.map((player, idx) => (
            <div
              key={player.sleeper_id}
              className="roster-row"
              onClick={() => onPlayerSelect(player)}
            >
              <span className="player-cell">
                <span className="rank">{idx + 1}</span>
                <span className="name">{player.player}</span>
                <span className="team-abbr">{player.nba_team}</span>
                {player.injury_status && (
                  <span className={`injury ${player.injury_status.toLowerCase()}`}>
                    {player.injury_status}
                  </span>
                )}
              </span>
              <span className="stat primary">{player.periodStats.expectedLockin.toFixed(1)}</span>
              <span className="stat">{player.periodStats.avgFpts.toFixed(1)}</span>
              <span className="stat ceiling">{player.periodStats.ceiling.toFixed(1)}</span>
              <span className="stat floor">{player.periodStats.floor.toFixed(1)}</span>
              <span className="stat">{player.periodStats.avgMinutes.toFixed(0)}</span>
              <span className={`trend-cell ${getMinutesTrendClass(player.periodStats.minutesTrendPct || 0)}`}>
                {(player.periodStats.minutesTrendPct || 0) > 5 && <TrendingUp size={12} />}
                {(player.periodStats.minutesTrendPct || 0) < -5 && <TrendingDown size={12} />}
                {Math.abs(player.periodStats.minutesTrendPct || 0) <= 5 && <Minus size={12} />}
                <span>{(player.periodStats.minutesTrendPct || 0) > 0 ? '+' : ''}{(player.periodStats.minutesTrendPct || 0).toFixed(0)}%</span>
              </span>
              <span className={`trend-cell ${player.lockinTrend.toLowerCase()}`}>
                {getTrendIcon(player.lockinTrend)}
                <span>{player.lockinTrendPct > 0 ? '+' : ''}{player.lockinTrendPct.toFixed(0)}%</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Full Roster Table - Bench */}
      {bench.length > 0 && (
        <div className="detail-card roster-card bench-roster">
          <h3>
            <Users size={16} />
            Bench ({bench.length})
          </h3>
          <div className="roster-table">
            <div className="roster-header">
              <span>Player</span>
              <SortHeader label="Lock-In" sortKeyName="lockin" />
              <SortHeader label="Avg" sortKeyName="avg" />
              <SortHeader label="Ceiling" sortKeyName="ceiling" />
              <SortHeader label="Floor" sortKeyName="floor" />
              <SortHeader label="Min" sortKeyName="minutes" />
              <SortHeader label="Min Trend" sortKeyName="minTrend" />
              <SortHeader label="Lock-In Trend" sortKeyName="lockinTrend" />
            </div>
            {bench.map((player, idx) => (
              <div
                key={player.sleeper_id}
                className="roster-row"
                onClick={() => onPlayerSelect(player)}
              >
                <span className="player-cell">
                  <span className="rank">{idx + 11}</span>
                  <span className="name">{player.player}</span>
                  <span className="team-abbr">{player.nba_team}</span>
                  {player.injury_status && (
                    <span className={`injury ${player.injury_status.toLowerCase()}`}>
                      {player.injury_status}
                    </span>
                  )}
                </span>
                <span className="stat primary">{player.periodStats.expectedLockin.toFixed(1)}</span>
                <span className="stat">{player.periodStats.avgFpts.toFixed(1)}</span>
                <span className="stat ceiling">{player.periodStats.ceiling.toFixed(1)}</span>
                <span className="stat floor">{player.periodStats.floor.toFixed(1)}</span>
                <span className="stat">{player.periodStats.avgMinutes.toFixed(0)}</span>
                <span className={`trend-cell ${getMinutesTrendClass(player.periodStats.minutesTrendPct || 0)}`}>
                  {(player.periodStats.minutesTrendPct || 0) > 5 && <TrendingUp size={12} />}
                  {(player.periodStats.minutesTrendPct || 0) < -5 && <TrendingDown size={12} />}
                  {Math.abs(player.periodStats.minutesTrendPct || 0) <= 5 && <Minus size={12} />}
                  <span>{(player.periodStats.minutesTrendPct || 0) > 0 ? '+' : ''}{(player.periodStats.minutesTrendPct || 0).toFixed(0)}%</span>
                </span>
                <span className={`trend-cell ${player.lockinTrend.toLowerCase()}`}>
                  {getTrendIcon(player.lockinTrend)}
                  <span>{player.lockinTrendPct > 0 ? '+' : ''}{player.lockinTrendPct.toFixed(0)}%</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

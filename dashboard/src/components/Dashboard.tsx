import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Trophy,
  Users,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  Filter,
  Shield,
  Calendar,
} from 'lucide-react';
import type { PlayerAnalytics, TeamAnalytics } from '../types';
import { calcPlayerPeriodStats, TIME_PERIODS, type TimePeriod } from '../lib/analytics';
import './Dashboard.css';

interface Props {
  players: PlayerAnalytics[];
  teams: TeamAnalytics[];
  onPlayerSelect: (player: PlayerAnalytics) => void;
}

type SortKey = 'rank' | 'record' | 'starterLockin' | 'benchLockin' | 'totalLockin' |
               'avgStarter' | 'elite50' | 'reliable45' | 'ceiling' | 'floor' | 'consistency';
type SortDir = 'asc' | 'desc';

// Use shared calculation utility from analytics.ts
// Wrapper to adapt shared function's return type to Dashboard needs
function calcPlayerStatsForPeriod(player: PlayerAnalytics, maxWeeks: number) {
  const stats = calcPlayerPeriodStats(player, maxWeeks);
  return {
    expectedLockin: stats.expectedLockin,
    avgFpts: stats.avgFpts,
    ceiling: stats.ceiling,
    floor: stats.floor,
    pct45plus: stats.pct45plus,
    pct40plus: stats.pct40plus,
    pctBust: stats.pctBust,
    reliability: stats.reliability, // Use canonical reliability formula from analytics.ts
  };
}

interface EnhancedTeamData {
  team: TeamAnalytics;
  starterLockin: number;
  benchLockin: number;
  totalLockin: number;
  avgStarter: number;
  elite50Count: number;  // Players with 50+ reliability
  reliable45Count: number; // Players hitting 45+ often
  avgCeiling: number; // Average ceiling across starters
  avgFloor: number;   // Average floor across starters
  teamConsistency: number; // Avg reliability across starters
  weeklyMedian: number;
  starterPlayers: PlayerAnalytics[];
  benchPlayers: PlayerAnalytics[];
  weeklyTotals: number[];  // Weekly lock-in totals for sparkline
}

// Simple Sparkline component
function Sparkline({ data, width = 60, height = 20 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  // Determine trend color
  const trend = data[data.length - 1] - data[0];
  const color = trend > 0 ? 'var(--te-green)' : trend < 0 ? 'var(--te-red)' : 'var(--te-blue)';

  return (
    <svg width={width} height={height} className="sparkline">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Dashboard({ teams, onPlayerSelect }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('starterLockin');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expandedTeam, setExpandedTeam] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [minElite, setMinElite] = useState(0);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('all');

  const periodConfig = TIME_PERIODS.find(p => p.value === timePeriod)!;

  // Compute enhanced team data based on selected time period
  const enhancedTeams = useMemo((): EnhancedTeamData[] => {
    const maxWeeks = periodConfig.weeks;

    return teams.map(team => {
      const teamPlayers = team.players || [];

      // Calculate period-specific stats for each player
      const playersWithPeriodStats = teamPlayers.map(p => ({
        player: p,
        stats: calcPlayerStatsForPeriod(p, maxWeeks),
      }));

      // Sort by expected lock-in for the selected period to get starters (top 10) and bench
      const sortedPlayers = [...playersWithPeriodStats].sort(
        (a, b) => b.stats.expectedLockin - a.stats.expectedLockin
      );
      const starters = sortedPlayers.slice(0, 10);
      const bench = sortedPlayers.slice(10);

      // Starter metrics using period stats
      const starterLockin = starters.reduce((sum, p) => sum + p.stats.expectedLockin, 0);
      const avgStarter = starters.length > 0 ? starterLockin / starters.length : 0;

      // Bench metrics
      const benchLockin = bench.reduce((sum, p) => sum + p.stats.expectedLockin, 0);

      // Elite/reliable counts - players with high 40+ or 45+ rates for the period
      const elite50Count = starters.filter(p => p.stats.pct40plus >= 30).length;
      const reliable45Count = starters.filter(p => p.stats.pct45plus >= 50).length;

      // Average Ceiling/Floor across starters for the period
      const avgCeiling = starters.length > 0
        ? starters.reduce((sum, p) => sum + p.stats.ceiling, 0) / starters.length
        : 0;
      const avgFloor = starters.length > 0
        ? starters.reduce((sum, p) => sum + p.stats.floor, 0) / starters.length
        : 0;

      // Team consistency - use canonical reliability score from analytics.ts
      const teamConsistency = starters.length > 0
        ? starters.reduce((sum, p) => sum + p.stats.reliability, 0) / starters.length
        : 0;

      // Weekly median - median of weekly max points across all players (filtered by period)
      const currentWeek = Math.max(...teamPlayers.flatMap(p => p.weeklyStats.map(w => w.week)));
      const minWeek = maxWeeks === 99 ? 1 : currentWeek - maxWeeks + 1;
      const allWeeklyMaxes: number[] = [];
      teamPlayers.forEach(p => {
        p.weeklyStats
          .filter(w => w.week >= minWeek)
          .forEach(w => allWeeklyMaxes.push(w.maxFpts));
      });
      allWeeklyMaxes.sort((a, b) => a - b);
      const mid = Math.floor(allWeeklyMaxes.length / 2);
      const weeklyMedian = allWeeklyMaxes.length > 0
        ? (allWeeklyMaxes.length % 2 !== 0 ? allWeeklyMaxes[mid] : (allWeeklyMaxes[mid - 1] + allWeeklyMaxes[mid]) / 2)
        : 0;

      // Calculate weekly totals for sparkline (sum of top 10 players' max for each week)
      const allWeeks = [...new Set(teamPlayers.flatMap(p => p.weeklyStats.map(w => w.week)))].sort((a, b) => a - b);
      const weeklyTotals = allWeeks.filter(w => w >= minWeek).map(week => {
        const weekMaxes = teamPlayers.map(p => {
          const ws = p.weeklyStats.find(w => w.week === week);
          return ws?.maxFpts || 0;
        }).sort((a, b) => b - a);
        return weekMaxes.slice(0, 10).reduce((a, b) => a + b, 0);
      });

      return {
        team,
        starterLockin,
        benchLockin,
        totalLockin: starterLockin + benchLockin,
        avgStarter,
        elite50Count,
        reliable45Count,
        avgCeiling,
        avgFloor,
        teamConsistency,
        weeklyMedian,
        starterPlayers: starters.map(s => s.player),
        benchPlayers: bench.map(b => b.player),
        weeklyTotals,
      };
    });
  }, [teams, periodConfig.weeks]);

  // Sort teams
  const sortedTeams = useMemo(() => {
    const filtered = minElite > 0
      ? enhancedTeams.filter(t => t.elite50Count >= minElite)
      : enhancedTeams;

    return [...filtered].sort((a, b) => {
      let valA: number, valB: number;
      switch (sortKey) {
        case 'rank':
          valA = a.team.wins - a.team.losses;
          valB = b.team.wins - b.team.losses;
          break;
        case 'record':
          valA = a.team.wins;
          valB = b.team.wins;
          break;
        case 'starterLockin':
          valA = a.starterLockin;
          valB = b.starterLockin;
          break;
        case 'benchLockin':
          valA = a.benchLockin;
          valB = b.benchLockin;
          break;
        case 'totalLockin':
          valA = a.totalLockin;
          valB = b.totalLockin;
          break;
        case 'avgStarter':
          valA = a.avgStarter;
          valB = b.avgStarter;
          break;
        case 'elite50':
          valA = a.elite50Count;
          valB = b.elite50Count;
          break;
        case 'reliable45':
          valA = a.reliable45Count;
          valB = b.reliable45Count;
          break;
        case 'ceiling':
          valA = a.avgCeiling;
          valB = b.avgCeiling;
          break;
        case 'floor':
          valA = a.avgFloor;
          valB = b.avgFloor;
          break;
        case 'consistency':
          valA = a.teamConsistency;
          valB = b.teamConsistency;
          break;
        default:
          valA = a.starterLockin;
          valB = b.starterLockin;
      }
      return sortDir === 'desc' ? valB - valA : valA - valB;
    });
  }, [enhancedTeams, sortKey, sortDir, minElite]);

  // Toggle sort
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const SortHeader = ({ label, sortKeyName }: { label: string; sortKeyName: SortKey }) => {
    const isActive = sortKey === sortKeyName;
    return (
      <th
        className={`sortable ${isActive ? 'active' : ''}`}
        onClick={() => handleSort(sortKeyName)}
      >
        <span>{label}</span>
        {isActive ? (
          sortDir === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />
        ) : (
          <ArrowUpDown size={12} />
        )}
      </th>
    );
  };

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.05 } },
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <motion.div
      className="dashboard standings-focus"
      variants={container}
      initial="hidden"
      animate="show"
    >
      {/* Header */}
      <motion.div className="standings-header" variants={item}>
        <div className="header-title">
          <Trophy size={24} />
          <h2>League Power Rankings</h2>
        </div>
        <div className="header-actions">
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
          <button
            className={`btn btn-ghost ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={16} />
            Filters
          </button>
        </div>
      </motion.div>

      {/* Filters */}
      {showFilters && (
        <motion.div className="filters-panel" variants={item}>
          <div className="filter-group">
            <label>Min Elite Players (50%+ rate)</label>
            <select value={minElite} onChange={e => setMinElite(Number(e.target.value))}>
              <option value={0}>All Teams</option>
              <option value={1}>At least 1 elite</option>
              <option value={2}>At least 2 elite</option>
              <option value={3}>At least 3 elite</option>
            </select>
          </div>
        </motion.div>
      )}

      {/* Main Standings Table */}
      <motion.div className="card standings-card enhanced" variants={item}>
        <div className="card-header">
          <h3 className="card-title">
            <Trophy size={18} />
            Detailed League Standings
          </h3>
          <span className="card-subtitle">Click team row to expand roster details</span>
        </div>
        <div className="table-wrapper standings-table-wrapper">
          <table className="data-table standings-table">
            <thead>
              <tr>
                <th className="sticky-col">#</th>
                <th className="sticky-col team-col">Team</th>
                <SortHeader label="W-L" sortKeyName="record" />
                <SortHeader label="Start" sortKeyName="starterLockin" />
                <SortHeader label="Bench" sortKeyName="benchLockin" />
                <SortHeader label="Total" sortKeyName="totalLockin" />
                <SortHeader label="Avg" sortKeyName="avgStarter" />
                <SortHeader label="E50" sortKeyName="elite50" />
                <SortHeader label="R45" sortKeyName="reliable45" />
                <SortHeader label="Ceil" sortKeyName="ceiling" />
                <SortHeader label="Floor" sortKeyName="floor" />
                <SortHeader label="Consist" sortKeyName="consistency" />
                <th>Trend</th>
                <th>Top</th>
              </tr>
            </thead>
            <tbody>
              {sortedTeams.map((data, idx) => (
                <>
                  <tr
                    key={data.team.rosterId}
                    className={`team-row ${expandedTeam === data.team.rosterId ? 'expanded' : ''} ${idx < 4 ? 'playoff' : ''}`}
                    onClick={() => setExpandedTeam(expandedTeam === data.team.rosterId ? null : data.team.rosterId)}
                  >
                    <td className="sticky-col">
                      <span className={`rank-badge ${idx < 4 ? 'playoff' : ''}`}>
                        {idx + 1}
                      </span>
                    </td>
                    <td className="sticky-col team-col">
                      <div className="team-info">
                        <span className="team-name">{data.team.teamName}</span>
                        <span className="owner-name">{data.team.ownerName}</span>
                      </div>
                      {expandedTeam === data.team.rosterId ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </td>
                    <td>
                      <span className="record">
                        <span className="wins">{data.team.wins}</span>
                        <span className="sep">-</span>
                        <span className="losses">{data.team.losses}</span>
                      </span>
                    </td>
                    <td className="stat-highlight primary">{data.starterLockin.toFixed(0)}</td>
                    <td className="stat-value">{data.benchLockin.toFixed(0)}</td>
                    <td className="stat-highlight total">{data.totalLockin.toFixed(0)}</td>
                    <td className="stat-value">{data.avgStarter.toFixed(1)}</td>
                    <td className="stat-value">
                      <span className={`elite-badge ${data.elite50Count >= 3 ? 'high' : data.elite50Count >= 1 ? 'mid' : 'low'}`}>
                        {data.elite50Count}
                      </span>
                    </td>
                    <td className="stat-value">
                      <span className={`reliable-badge ${data.reliable45Count >= 5 ? 'high' : data.reliable45Count >= 3 ? 'mid' : 'low'}`}>
                        {data.reliable45Count}
                      </span>
                    </td>
                    <td className="stat-value ceiling">{data.avgCeiling.toFixed(0)}</td>
                    <td className="stat-value floor">{data.avgFloor.toFixed(0)}</td>
                    <td className="stat-value">
                      <div className="consistency-bar">
                        <div
                          className="consistency-fill"
                          style={{ width: `${data.teamConsistency}%` }}
                        />
                        <span>{data.teamConsistency.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="sparkline-cell">
                      <Sparkline data={data.weeklyTotals} />
                    </td>
                    <td
                      className="top-player-cell"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (data.starterPlayers[0]) onPlayerSelect(data.starterPlayers[0]);
                      }}
                    >
                      {data.starterPlayers[0]?.player.split(' ').slice(-1)[0]}
                    </td>
                  </tr>
                  {expandedTeam === data.team.rosterId && (
                    <tr className="expanded-row">
                      <td colSpan={14}>
                        <div className="team-roster-detail">
                          <div className="roster-section">
                            <h4><Users size={14} /> Starters (Top 10)</h4>
                            <div className="roster-grid">
                              {data.starterPlayers.map((p, i) => (
                                <div
                                  key={p.sleeper_id}
                                  className="roster-player"
                                  onClick={() => onPlayerSelect(p)}
                                >
                                  <span className="player-rank">{i + 1}</span>
                                  <div className="player-info">
                                    <span className="player-name">{p.player}</span>
                                    <span className="player-meta">{p.nba_team} • {p.position}</span>
                                  </div>
                                  <div className="player-stats-mini">
                                    <span className="lockin-value">{p.expectedLockin.toFixed(1)}</span>
                                    <span className={`pct-badge ${p.pct45plus >= 50 ? 'good' : p.pct45plus >= 30 ? 'ok' : 'bad'}`}>
                                      {p.pct45plus.toFixed(0)}% at 45+
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                          {data.benchPlayers.length > 0 && (
                            <div className="roster-section bench">
                              <h4><Shield size={14} /> Bench ({data.benchPlayers.length})</h4>
                              <div className="roster-grid bench-grid">
                                {data.benchPlayers.slice(0, 5).map((p) => (
                                  <div
                                    key={p.sleeper_id}
                                    className="roster-player bench"
                                    onClick={() => onPlayerSelect(p)}
                                  >
                                    <div className="player-info">
                                      <span className="player-name">{p.player}</span>
                                      <span className="player-meta">{p.nba_team}</span>
                                    </div>
                                    <span className="lockin-value">{p.expectedLockin.toFixed(1)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

    </motion.div>
  );
}

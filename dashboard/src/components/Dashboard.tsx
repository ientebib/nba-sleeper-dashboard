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
} from 'lucide-react';
import type { PlayerAnalytics, TeamAnalytics } from '../types';
import './Dashboard.css';

interface Props {
  players: PlayerAnalytics[];
  teams: TeamAnalytics[];
  onPlayerSelect: (player: PlayerAnalytics) => void;
}

type SortKey = 'rank' | 'record' | 'starterLockin' | 'benchLockin' | 'totalLockin' |
               'avgStarter' | 'elite50' | 'reliable45' | 'ceiling' | 'floor' | 'consistency';
type SortDir = 'asc' | 'desc';

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
}

export default function Dashboard({ teams, onPlayerSelect }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('starterLockin');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expandedTeam, setExpandedTeam] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [minElite, setMinElite] = useState(0);

  // Compute enhanced team data
  const enhancedTeams = useMemo((): EnhancedTeamData[] => {
    return teams.map(team => {
      const teamPlayers = team.players || [];

      // Sort by expected lock-in to get starters (top 10) and bench
      const sortedPlayers = [...teamPlayers].sort((a, b) => b.expectedLockin - a.expectedLockin);
      const starters = sortedPlayers.slice(0, 10);
      const bench = sortedPlayers.slice(10);

      // Starter metrics
      const starterLockin = starters.reduce((sum, p) => sum + p.expectedLockin, 0);
      const avgStarter = starters.length > 0 ? starterLockin / starters.length : 0;

      // Bench metrics
      const benchLockin = bench.reduce((sum, p) => sum + p.expectedLockin, 0);

      // Elite/reliable counts - players with high 45+ or 50+ rates
      const elite50Count = starters.filter(p => p.pct50plus >= 30).length;
      const reliable45Count = starters.filter(p => p.pct45plus >= 50).length;

      // Average Ceiling/Floor across starters
      const avgCeiling = starters.length > 0
        ? starters.reduce((sum, p) => sum + p.lockinCeiling, 0) / starters.length
        : 0;
      const avgFloor = starters.length > 0
        ? starters.reduce((sum, p) => sum + p.lockinFloor, 0) / starters.length
        : 0;

      // Team consistency - weighted by 45%+ rate and low bust rate
      const teamConsistency = starters.length > 0
        ? starters.reduce((sum, p) => sum + (p.pct45plus + (100 - p.pctUnder35)) / 2, 0) / starters.length
        : 0;

      // Weekly median - median of weekly max points across all players
      const allWeeklyMaxes: number[] = [];
      teamPlayers.forEach(p => {
        p.weeklyStats.forEach(w => allWeeklyMaxes.push(w.maxFpts));
      });
      allWeeklyMaxes.sort((a, b) => a - b);
      const mid = Math.floor(allWeeklyMaxes.length / 2);
      const weeklyMedian = allWeeklyMaxes.length > 0
        ? (allWeeklyMaxes.length % 2 !== 0 ? allWeeklyMaxes[mid] : (allWeeklyMaxes[mid - 1] + allWeeklyMaxes[mid]) / 2)
        : 0;

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
        starterPlayers: starters,
        benchPlayers: bench,
      };
    });
  }, [teams]);

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

  const SortHeader = ({ label, sortKeyName }: { label: string; sortKeyName: SortKey }) => (
    <th
      className={`sortable ${sortKey === sortKeyName ? 'active' : ''}`}
      onClick={() => handleSort(sortKeyName)}
    >
      <span>{label}</span>
      <ArrowUpDown size={12} />
    </th>
  );

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
                <SortHeader label="Ceil" sortKeyName="ceiling" />
                <SortHeader label="Floor" sortKeyName="floor" />
                <SortHeader label="Consist" sortKeyName="consistency" />
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
                      <td colSpan={11}>
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

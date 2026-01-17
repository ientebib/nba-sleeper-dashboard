import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ArrowUpDown,
} from 'lucide-react';
import {
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from 'recharts';
import type { TeamAnalytics, PlayerAnalytics } from '../types';
import './TeamsView.css';

interface Props {
  teams: TeamAnalytics[];
  onPlayerSelect: (player: PlayerAnalytics) => void;
  onTeamSelect?: (team: TeamAnalytics) => void;
}

type RosterSortKey = 'player' | 'nba_team' | 'position' | 'totalGames' | 'expectedLockin' | 'avgFpts' | 'lockinCeiling' | 'lockinTrendPct';
type SortDir = 'asc' | 'desc';

export default function TeamsView({ teams, onPlayerSelect, onTeamSelect }: Props) {
  const [expandedTeam, setExpandedTeam] = useState<number | null>(null);
  const [selectedTeams, setSelectedTeams] = useState<number[]>([]);
  const [rosterSortKey, setRosterSortKey] = useState<RosterSortKey>('expectedLockin');
  const [rosterSortDir, setRosterSortDir] = useState<SortDir>('desc');

  const handleRosterSort = (key: RosterSortKey) => {
    if (rosterSortKey === key) {
      setRosterSortDir(rosterSortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setRosterSortKey(key);
      setRosterSortDir('desc');
    }
  };

  const RosterSortIcon = ({ column }: { column: RosterSortKey }) => {
    if (rosterSortKey !== column) return <ArrowUpDown size={12} className="sort-icon inactive" />;
    return rosterSortDir === 'desc'
      ? <ChevronDown size={12} className="sort-icon active" />
      : <ChevronUp size={12} className="sort-icon active" />;
  };

  // Team comparison radar data
  const maxLockin = Math.max(...teams.map(t => t.totalExpectedLockin));
  const maxWins = Math.max(...teams.map(t => t.wins));

  const getRadarData = (team: TeamAnalytics) => {
    const topPlayerAvg = team.topLockinPlayers.slice(0, 3).reduce((sum, p) => sum + p.expectedLockin, 0) / 3;
    const restAvg = team.players.slice(3).reduce((sum, p) => sum + p.expectedLockin, 0) / Math.max(1, team.players.length - 3);
    const consistency = team.players.reduce((sum, p) => sum + (p.lockinTrend === 'STABLE' ? 1 : 0), 0) / team.players.length * 100;
    const upside = team.players.reduce((sum, p) => sum + p.lockinCeiling, 0) / team.players.length;

    return [
      { stat: 'Total Lock-In', value: (team.totalExpectedLockin / maxLockin) * 100, fullMark: 100 },
      { stat: 'Top 3 Avg', value: (topPlayerAvg / 70) * 100, fullMark: 100 },
      { stat: 'Depth', value: (restAvg / 40) * 100, fullMark: 100 },
      { stat: 'Consistency', value: consistency, fullMark: 100 },
      { stat: 'Upside', value: (upside / 80) * 100, fullMark: 100 },
      { stat: 'Win Rate', value: (team.wins / maxWins) * 100, fullMark: 100 },
    ];
  };

  const toggleTeam = (rosterId: number) => {
    setExpandedTeam(expandedTeam === rosterId ? null : rosterId);
  };

  const toggleCompare = (rosterId: number) => {
    if (selectedTeams.includes(rosterId)) {
      setSelectedTeams(selectedTeams.filter(id => id !== rosterId));
    } else if (selectedTeams.length < 2) {
      setSelectedTeams([...selectedTeams, rosterId]);
    }
  };

  const sortRosterPlayers = (players: PlayerAnalytics[]) => {
    return [...players].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      switch (rosterSortKey) {
        case 'player':
          aVal = a.player.toLowerCase();
          bVal = b.player.toLowerCase();
          break;
        case 'nba_team':
          aVal = a.nba_team.toLowerCase();
          bVal = b.nba_team.toLowerCase();
          break;
        case 'position':
          aVal = a.position;
          bVal = b.position;
          break;
        default:
          aVal = a[rosterSortKey] as number;
          bVal = b[rosterSortKey] as number;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return rosterSortDir === 'desc' ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
      }
      return rosterSortDir === 'desc' ? (bVal as number) - (aVal as number) : (aVal as number) - (bVal as number);
    });
  };

  return (
    <motion.div
      className="teams-view"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Comparison Section */}
      {selectedTeams.length === 2 && (
        <div className="comparison-section">
          <div className="card comparison-card">
            <div className="card-header">
              <h3 className="card-title">
                <Users size={18} />
                Team Comparison
              </h3>
              <button
                className="btn btn-ghost"
                onClick={() => setSelectedTeams([])}
              >
                Clear Comparison
              </button>
            </div>
            <div className="comparison-content">
              {selectedTeams.map((rosterId, idx) => {
                const team = teams.find(t => t.rosterId === rosterId)!;
                return (
                  <div key={rosterId} className="comparison-team">
                    <ResponsiveContainer width="100%" height={300}>
                      <RadarChart data={getRadarData(team)}>
                        <PolarGrid stroke="#2a2a3a" />
                        <PolarAngleAxis dataKey="stat" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                        <PolarRadiusAxis tick={false} axisLine={false} />
                        <Radar
                          name={team.ownerName}
                          dataKey="value"
                          stroke={idx === 0 ? '#6366f1' : '#22c55e'}
                          fill={idx === 0 ? '#6366f1' : '#22c55e'}
                          fillOpacity={0.3}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                    <div className="comparison-label">{team.ownerName}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Team Cards */}
      <div className="teams-list">
        {teams.map((team, idx) => (
          <motion.div
            key={team.rosterId}
            className={`card team-card ${expandedTeam === team.rosterId ? 'expanded' : ''} ${selectedTeams.includes(team.rosterId) ? 'selected' : ''}`}
            layout
          >
            <div className="team-header" onClick={() => toggleTeam(team.rosterId)}>
              <div className="team-rank">
                <span className={`rank-badge ${idx < 4 ? 'playoff' : ''}`}>{idx + 1}</span>
              </div>
              <div className="team-info">
                <h3 className="team-name">{team.teamName}</h3>
                <span className="team-owner">{team.ownerName}</span>
              </div>
              <div className="team-record">
                <span className="wins">{team.wins}</span>
                <span className="sep">-</span>
                <span className="losses">{team.losses}</span>
              </div>
              <div className="team-lockin">
                <span className="lockin-value">{team.totalExpectedLockin.toFixed(0)}</span>
                <span className="lockin-label">Total Lock-In</span>
              </div>
              <div className="team-actions">
                {onTeamSelect && (
                  <button
                    className="btn btn-primary view-btn"
                    onClick={(e) => { e.stopPropagation(); onTeamSelect(team); }}
                  >
                    View
                  </button>
                )}
                <button
                  className={`btn btn-secondary compare-btn ${selectedTeams.includes(team.rosterId) ? 'active' : ''}`}
                  onClick={(e) => { e.stopPropagation(); toggleCompare(team.rosterId); }}
                  disabled={selectedTeams.length >= 2 && !selectedTeams.includes(team.rosterId)}
                >
                  {selectedTeams.includes(team.rosterId) ? 'Selected' : 'Compare'}
                </button>
                {expandedTeam === team.rosterId ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
              </div>
            </div>

            {expandedTeam === team.rosterId && (
              <motion.div
                className="team-roster"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <table className="data-table roster-table">
                  <thead>
                    <tr>
                      <th className="sortable" onClick={() => handleRosterSort('player')}>
                        Player <RosterSortIcon column="player" />
                      </th>
                      <th className="sortable" onClick={() => handleRosterSort('nba_team')}>
                        NBA <RosterSortIcon column="nba_team" />
                      </th>
                      <th className="sortable" onClick={() => handleRosterSort('position')}>
                        Pos <RosterSortIcon column="position" />
                      </th>
                      <th className="sortable" onClick={() => handleRosterSort('totalGames')}>
                        GP <RosterSortIcon column="totalGames" />
                      </th>
                      <th className="sortable" onClick={() => handleRosterSort('expectedLockin')}>
                        Exp Lock-In <RosterSortIcon column="expectedLockin" />
                      </th>
                      <th className="sortable" onClick={() => handleRosterSort('avgFpts')}>
                        Avg FPTS <RosterSortIcon column="avgFpts" />
                      </th>
                      <th className="sortable" onClick={() => handleRosterSort('lockinCeiling')}>
                        Ceiling <RosterSortIcon column="lockinCeiling" />
                      </th>
                      <th className="sortable" onClick={() => handleRosterSort('lockinTrendPct')}>
                        Trend <RosterSortIcon column="lockinTrendPct" />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortRosterPlayers(team.players).map(player => (
                      <tr key={player.sleeper_id} onClick={() => onPlayerSelect(player)}>
                        <td>
                          <div className="player-cell">
                            <span className="player-name">{player.player}</span>
                            {player.injury_status && (
                              <span className={`injury-badge ${player.injury_status.toLowerCase()}`}>
                                {player.injury_status}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>{player.nba_team}</td>
                        <td><span className="player-position">{player.position}</span></td>
                        <td>{player.totalGames}</td>
                        <td className="stat-highlight positive">{player.expectedLockin.toFixed(1)}</td>
                        <td>{player.avgFpts.toFixed(1)}</td>
                        <td>{player.lockinCeiling.toFixed(1)}</td>
                        <td>
                          <span className={`trend-badge ${player.lockinTrend.toLowerCase()}`}>
                            {player.lockinTrend === 'RISING' && <TrendingUp size={12} />}
                            {player.lockinTrend === 'FALLING' && <TrendingDown size={12} />}
                            {player.lockinTrendPct > 0 ? '+' : ''}{player.lockinTrendPct.toFixed(0)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </motion.div>
            )}
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

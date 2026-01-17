import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Swords,
  Calendar,
  Trophy,
  Target,
  Activity,
  Users,
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
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from 'recharts';
import type { PlayerAnalytics, TeamAnalytics } from '../types';
import { calcPlayerPeriodStats } from '../lib/analytics';
import './HeadToHead.css';

interface Props {
  teams: TeamAnalytics[];
  players: PlayerAnalytics[];
  onPlayerSelect: (player: PlayerAnalytics) => void;
}

type TimePeriod = 'all' | 'L3W' | 'L4W' | 'L6W' | 'L8W';

const TIME_PERIODS: { value: TimePeriod; label: string; weeks: number }[] = [
  { value: 'all', label: 'Season', weeks: 99 },
  { value: 'L3W', label: '3W', weeks: 3 },
  { value: 'L4W', label: '4W', weeks: 4 },
  { value: 'L6W', label: '6W', weeks: 6 },
  { value: 'L8W', label: '8W', weeks: 8 },
];

const TEAM_COLORS = {
  team1: '#6366f1',
  team2: '#f59e0b',
};

// Use shared calculation utility from analytics.ts
// Wrapper to add consistency calculation (specific to HeadToHead)
function calcPlayerStats(player: PlayerAnalytics, maxWeeks: number) {
  const stats = calcPlayerPeriodStats(player, maxWeeks);

  // Calculate consistency from reliability score (already computed)
  // Convert reliability (0-100) to consistency format expected by HeadToHead
  const consistency = stats.reliability;

  return {
    expectedLockin: stats.expectedLockin,
    avgFpts: stats.avgFpts,
    ceiling: stats.ceiling,
    floor: stats.floor,
    avgMinutes: stats.avgMinutes,
    consistency: Math.max(0, Math.min(100, consistency)),
  };
}

function calcTeamStats(teamPlayers: PlayerAnalytics[], maxWeeks: number) {
  const playerStats = teamPlayers.map(p => ({
    player: p,
    stats: calcPlayerStats(p, maxWeeks),
  })).filter(p => p.stats.expectedLockin > 0);

  // Top 10 starters
  const starters = playerStats
    .sort((a, b) => b.stats.expectedLockin - a.stats.expectedLockin)
    .slice(0, 10);

  const totalLockin = starters.reduce((sum, p) => sum + p.stats.expectedLockin, 0);
  const totalCeiling = starters.reduce((sum, p) => sum + p.stats.ceiling, 0);
  const totalFloor = starters.reduce((sum, p) => sum + p.stats.floor, 0);
  const avgConsistency = starters.length > 0
    ? starters.reduce((sum, p) => sum + p.stats.consistency, 0) / starters.length
    : 0;

  return {
    starters,
    totalLockin,
    totalCeiling,
    totalFloor,
    avgConsistency,
    avgLockin: starters.length > 0 ? totalLockin / starters.length : 0,
  };
}

export default function HeadToHead({ teams, players }: Props) {
  const [team1Id, setTeam1Id] = useState<number | null>(teams[0]?.rosterId || null);
  const [team2Id, setTeam2Id] = useState<number | null>(teams[1]?.rosterId || null);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('L4W');

  const periodConfig = TIME_PERIODS.find(p => p.value === timePeriod)!;

  const team1 = teams.find(t => t.rosterId === team1Id);
  const team2 = teams.find(t => t.rosterId === team2Id);

  // Get team players
  const team1Players = useMemo(() => {
    if (!team1) return [];
    return players.filter(p => p.fantasy_team === team1.ownerName);
  }, [team1, players]);

  const team2Players = useMemo(() => {
    if (!team2) return [];
    return players.filter(p => p.fantasy_team === team2.ownerName);
  }, [team2, players]);

  // Calculate team stats
  const team1Stats = useMemo(() => calcTeamStats(team1Players, periodConfig.weeks), [team1Players, periodConfig.weeks]);
  const team2Stats = useMemo(() => calcTeamStats(team2Players, periodConfig.weeks), [team2Players, periodConfig.weeks]);

  // Weekly comparison data
  const weeklyComparison = useMemo(() => {
    if (!team1 || !team2) return [];

    const currentWeek = Math.max(...players.flatMap(p => p.weeklyStats.map(w => w.week)));
    const startWeek = periodConfig.weeks === 99 ? 1 : currentWeek - periodConfig.weeks + 1;

    const weeks: { week: string; team1: number; team2: number }[] = [];

    for (let w = Math.max(1, startWeek); w <= currentWeek; w++) {
      // Calculate each team's total max FPTS for the week (top 10 starters)
      const t1WeekMaxes = team1Players
        .map(p => p.weeklyStats.find(ws => ws.week === w)?.maxFpts || 0)
        .sort((a, b) => b - a)
        .slice(0, 10);
      const t2WeekMaxes = team2Players
        .map(p => p.weeklyStats.find(ws => ws.week === w)?.maxFpts || 0)
        .sort((a, b) => b - a)
        .slice(0, 10);

      weeks.push({
        week: `W${w}`,
        team1: t1WeekMaxes.reduce((a, b) => a + b, 0),
        team2: t2WeekMaxes.reduce((a, b) => a + b, 0),
      });
    }

    return weeks;
  }, [team1, team2, team1Players, team2Players, players, periodConfig.weeks]);

  // Radar comparison data
  const radarData = useMemo(() => {
    if (!team1Stats || !team2Stats) return [];

    const maxLockin = Math.max(team1Stats.totalLockin, team2Stats.totalLockin);
    const maxCeiling = Math.max(team1Stats.totalCeiling, team2Stats.totalCeiling);
    const maxFloor = Math.max(team1Stats.totalFloor, team2Stats.totalFloor);

    return [
      {
        stat: 'Lock-In',
        team1: (team1Stats.totalLockin / maxLockin) * 100,
        team2: (team2Stats.totalLockin / maxLockin) * 100,
      },
      {
        stat: 'Ceiling',
        team1: (team1Stats.totalCeiling / maxCeiling) * 100,
        team2: (team2Stats.totalCeiling / maxCeiling) * 100,
      },
      {
        stat: 'Floor',
        team1: (team1Stats.totalFloor / maxFloor) * 100,
        team2: (team2Stats.totalFloor / maxFloor) * 100,
      },
      {
        stat: 'Consistency',
        team1: team1Stats.avgConsistency,
        team2: team2Stats.avgConsistency,
      },
    ];
  }, [team1Stats, team2Stats]);

  // Position-by-position comparison
  const positionComparison = useMemo(() => {
    if (!team1Stats || !team2Stats) return [];

    const positions = ['PG', 'SG', 'SF', 'PF', 'C'];
    return positions.map(pos => {
      const t1PosPlayers = team1Stats.starters.filter(p => p.player.position === pos);
      const t2PosPlayers = team2Stats.starters.filter(p => p.player.position === pos);

      const t1Total = t1PosPlayers.reduce((sum, p) => sum + p.stats.expectedLockin, 0);
      const t2Total = t2PosPlayers.reduce((sum, p) => sum + p.stats.expectedLockin, 0);

      return {
        position: pos,
        team1: Number(t1Total.toFixed(1)),
        team2: Number(t2Total.toFixed(1)),
        winner: t1Total > t2Total ? 1 : t2Total > t1Total ? 2 : 0,
      };
    });
  }, [team1Stats, team2Stats]);

  // Head-to-head player matchups (by position ranking)
  const playerMatchups = useMemo(() => {
    if (!team1Stats || !team2Stats) return [];

    const maxLen = Math.max(team1Stats.starters.length, team2Stats.starters.length);
    const matchups = [];

    for (let i = 0; i < maxLen; i++) {
      const p1 = team1Stats.starters[i];
      const p2 = team2Stats.starters[i];

      matchups.push({
        rank: i + 1,
        player1: p1 ? { name: p1.player.player, lockin: p1.stats.expectedLockin, pos: p1.player.position } : null,
        player2: p2 ? { name: p2.player.player, lockin: p2.stats.expectedLockin, pos: p2.player.position } : null,
      });
    }

    return matchups;
  }, [team1Stats, team2Stats]);

  const getWinner = () => {
    if (!team1Stats || !team2Stats) return null;
    if (team1Stats.totalLockin > team2Stats.totalLockin) return 1;
    if (team2Stats.totalLockin > team1Stats.totalLockin) return 2;
    return 0;
  };

  const winner = getWinner();

  return (
    <motion.div
      className="head-to-head"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Header */}
      <div className="h2h-header">
        <div className="h2h-title-section">
          <h2 className="h2h-title">
            <Swords size={24} />
            Head-to-Head Comparison
          </h2>
          <p className="h2h-subtitle">Compare two teams side by side</p>
        </div>

        <div className="h2h-controls">
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

      {/* Team Selectors */}
      <div className="team-selectors">
        <div className="team-selector team1">
          <label>Team 1</label>
          <select
            value={team1Id || ''}
            onChange={e => setTeam1Id(Number(e.target.value))}
          >
            <option value="">Select Team</option>
            {teams.map(t => (
              <option key={t.rosterId} value={t.rosterId} disabled={t.rosterId === team2Id}>
                {t.teamName}
              </option>
            ))}
          </select>
        </div>

        <div className="vs-badge">VS</div>

        <div className="team-selector team2">
          <label>Team 2</label>
          <select
            value={team2Id || ''}
            onChange={e => setTeam2Id(Number(e.target.value))}
          >
            <option value="">Select Team</option>
            {teams.map(t => (
              <option key={t.rosterId} value={t.rosterId} disabled={t.rosterId === team1Id}>
                {t.teamName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {team1 && team2 && (
        <>
          {/* Winner Banner */}
          <div className={`winner-banner ${winner === 1 ? 'team1-wins' : winner === 2 ? 'team2-wins' : 'tie'}`}>
            <Trophy size={20} />
            <span>
              {winner === 1 && `${team1.teamName} leads by ${(team1Stats.totalLockin - team2Stats.totalLockin).toFixed(1)} Lock-In`}
              {winner === 2 && `${team2.teamName} leads by ${(team2Stats.totalLockin - team1Stats.totalLockin).toFixed(1)} Lock-In`}
              {winner === 0 && 'Dead Even!'}
            </span>
          </div>

          {/* Summary Stats */}
          <div className="h2h-summary-grid">
            <div className="summary-card team1-card">
              <div className="team-header">
                <span className="team-color" style={{ background: TEAM_COLORS.team1 }} />
                <span className="team-name">{team1.teamName}</span>
                <span className="team-record">{team1.record}</span>
              </div>
              <div className="summary-stats">
                <div className="summary-stat">
                  <span className="stat-label">Total Lock-In</span>
                  <span className={`stat-value ${winner === 1 ? 'winner' : ''}`}>
                    {team1Stats.totalLockin.toFixed(1)}
                  </span>
                </div>
                <div className="summary-stat">
                  <span className="stat-label">Ceiling</span>
                  <span className="stat-value ceiling">{team1Stats.totalCeiling.toFixed(1)}</span>
                </div>
                <div className="summary-stat">
                  <span className="stat-label">Floor</span>
                  <span className="stat-value floor">{team1Stats.totalFloor.toFixed(1)}</span>
                </div>
                <div className="summary-stat">
                  <span className="stat-label">Consistency</span>
                  <span className="stat-value">{team1Stats.avgConsistency.toFixed(0)}%</span>
                </div>
              </div>
            </div>

            <div className="summary-card team2-card">
              <div className="team-header">
                <span className="team-color" style={{ background: TEAM_COLORS.team2 }} />
                <span className="team-name">{team2.teamName}</span>
                <span className="team-record">{team2.record}</span>
              </div>
              <div className="summary-stats">
                <div className="summary-stat">
                  <span className="stat-label">Total Lock-In</span>
                  <span className={`stat-value ${winner === 2 ? 'winner' : ''}`}>
                    {team2Stats.totalLockin.toFixed(1)}
                  </span>
                </div>
                <div className="summary-stat">
                  <span className="stat-label">Ceiling</span>
                  <span className="stat-value ceiling">{team2Stats.totalCeiling.toFixed(1)}</span>
                </div>
                <div className="summary-stat">
                  <span className="stat-label">Floor</span>
                  <span className="stat-value floor">{team2Stats.totalFloor.toFixed(1)}</span>
                </div>
                <div className="summary-stat">
                  <span className="stat-label">Consistency</span>
                  <span className="stat-value">{team2Stats.avgConsistency.toFixed(0)}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Charts Grid */}
          <div className="h2h-charts-grid">
            {/* Weekly Performance */}
            <div className="h2h-chart-card">
              <h4>
                <Activity size={16} />
                Weekly Performance
              </h4>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={weeklyComparison}>
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
                    dataKey="team1"
                    name={team1.teamName}
                    stroke={TEAM_COLORS.team1}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="team2"
                    name={team2.teamName}
                    stroke={TEAM_COLORS.team2}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Radar Comparison */}
            <div className="h2h-chart-card">
              <h4>
                <Target size={16} />
                Overall Comparison
              </h4>
              <ResponsiveContainer width="100%" height={250}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="var(--border-subtle)" />
                  <PolarAngleAxis dataKey="stat" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                  <PolarRadiusAxis tick={false} axisLine={false} />
                  <Radar
                    name={team1.teamName}
                    dataKey="team1"
                    stroke={TEAM_COLORS.team1}
                    fill={TEAM_COLORS.team1}
                    fillOpacity={0.25}
                  />
                  <Radar
                    name={team2.teamName}
                    dataKey="team2"
                    stroke={TEAM_COLORS.team2}
                    fill={TEAM_COLORS.team2}
                    fillOpacity={0.25}
                  />
                  <Legend />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            {/* Position Breakdown */}
            <div className="h2h-chart-card full-width">
              <h4>
                <Users size={16} />
                Position Breakdown
              </h4>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={positionComparison} layout="vertical">
                  <XAxis type="number" stroke="var(--text-muted)" fontSize={10} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="position"
                    stroke="var(--text-muted)"
                    fontSize={11}
                    tickLine={false}
                    width={40}
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
                  <Legend />
                  <Bar dataKey="team1" name={team1.teamName} fill={TEAM_COLORS.team1} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="team2" name={team2.teamName} fill={TEAM_COLORS.team2} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Player Matchups */}
          <div className="h2h-matchups-card">
            <h4>
              <Swords size={16} />
              Player Matchups (by Lock-In Rank)
            </h4>
            <div className="matchups-table">
              <div className="matchups-header">
                <span className="team1-header" style={{ color: TEAM_COLORS.team1 }}>{team1.teamName}</span>
                <span className="rank-header">#</span>
                <span className="team2-header" style={{ color: TEAM_COLORS.team2 }}>{team2.teamName}</span>
              </div>
              {playerMatchups.map(matchup => {
                const p1Wins = matchup.player1 && matchup.player2 && matchup.player1.lockin > matchup.player2.lockin;
                const p2Wins = matchup.player1 && matchup.player2 && matchup.player2.lockin > matchup.player1.lockin;
                return (
                  <div key={matchup.rank} className="matchup-row">
                    <div className={`matchup-player team1 ${p1Wins ? 'winner' : ''}`}>
                      {matchup.player1 ? (
                        <>
                          <span className="player-name">{matchup.player1.name}</span>
                          <span className="player-pos">{matchup.player1.pos}</span>
                          <span className="player-lockin">{matchup.player1.lockin.toFixed(1)}</span>
                        </>
                      ) : (
                        <span className="empty">-</span>
                      )}
                    </div>
                    <span className="matchup-rank">{matchup.rank}</span>
                    <div className={`matchup-player team2 ${p2Wins ? 'winner' : ''}`}>
                      {matchup.player2 ? (
                        <>
                          <span className="player-lockin">{matchup.player2.lockin.toFixed(1)}</span>
                          <span className="player-pos">{matchup.player2.pos}</span>
                          <span className="player-name">{matchup.player2.name}</span>
                        </>
                      ) : (
                        <span className="empty">-</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {(!team1 || !team2) && (
        <div className="h2h-empty-state">
          <Swords size={48} />
          <h3>Select Two Teams to Compare</h3>
          <p>Choose teams from the dropdowns above to see a detailed head-to-head analysis</p>
        </div>
      )}
    </motion.div>
  );
}

import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  Target,
  Activity,
  BarChart3,
  Calendar,
  Gauge,
  Zap,
  Shield,
  CalendarDays,
  User,
  CheckCircle,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import {
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ComposedChart,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import type { PlayerAnalytics } from '../types';
import type { NBASchedule } from '../lib/dataLoader';
import './PlayerDetail.css';

interface Props {
  player: PlayerAnalytics;
  allPlayers: PlayerAnalytics[];
  onBack: () => void;
  nbaSchedule: NBASchedule | null;
  backLabel?: string;
}

type TabType = 'thisWeek' | 'profile';
type TimePeriod = 'all' | 'L3W' | 'L4W' | 'L5W' | 'L6W' | 'L8W';

const TIME_PERIODS: { value: TimePeriod; label: string; weeks: number }[] = [
  { value: 'all', label: 'Season', weeks: 99 },
  { value: 'L3W', label: '3W', weeks: 3 },
  { value: 'L4W', label: '4W', weeks: 4 },
  { value: 'L5W', label: '5W', weeks: 5 },
  { value: 'L6W', label: '6W', weeks: 6 },
  { value: 'L8W', label: '8W', weeks: 8 },
];

// Calculate filtered stats for a player based on time period
function calcFilteredStats(player: PlayerAnalytics, maxWeeks: number) {
  const currentWeek = Math.max(...player.weeklyStats.map(w => w.week));
  const minWeek = maxWeeks === 99 ? 1 : currentWeek - maxWeeks + 1;

  const filteredWeeks = player.weeklyStats.filter(w => w.week >= minWeek);

  if (filteredWeeks.length === 0) {
    return {
      expectedLockin: player.expectedLockin,
      avgFpts: player.avgFpts,
      medianFpts: player.medianFpts,
      stdFpts: player.stdFpts,
      lockinCeiling: player.lockinCeiling,
      lockinFloor: player.lockinFloor,
      avgMinutes: player.avgMinutes,
      totalGames: player.totalGames,
      gamesPerWeek: player.gamesPerWeek,
      pct50plus: player.pct50plus,
      pct60plus: player.pct60plus,
      pctUnder35: player.pctUnder35,
      weeks: player.weeklyStats.length,
    };
  }

  const maxFptsList = filteredWeeks.map(w => w.maxFpts);
  const avgFptsList = filteredWeeks.map(w => w.avgFpts);
  const minutesList = filteredWeeks.map(w => w.avgMinutes);
  const totalGames = filteredWeeks.reduce((sum, w) => sum + w.games, 0);

  // Calculate median
  const sortedAvgs = [...avgFptsList].sort((a, b) => a - b);
  const mid = Math.floor(sortedAvgs.length / 2);
  const median = sortedAvgs.length % 2 !== 0
    ? sortedAvgs[mid]
    : (sortedAvgs[mid - 1] + sortedAvgs[mid]) / 2;

  // Calculate standard deviation
  const avgFpts = avgFptsList.reduce((a, b) => a + b, 0) / avgFptsList.length;
  const variance = avgFptsList.reduce((sum, val) => sum + Math.pow(val - avgFpts, 2), 0) / avgFptsList.length;
  const stdFpts = Math.sqrt(variance);

  // Get all games in the filtered period
  const filteredGames = player.games.filter(g => g.week >= minWeek);
  const games50plus = filteredGames.filter(g => g.fpts >= 50).length;
  const games60plus = filteredGames.filter(g => g.fpts >= 60).length;
  const gamesUnder35 = filteredGames.filter(g => g.fpts < 35).length;

  return {
    expectedLockin: maxFptsList.reduce((a, b) => a + b, 0) / maxFptsList.length,
    avgFpts,
    medianFpts: median,
    stdFpts,
    lockinCeiling: Math.max(...maxFptsList),
    lockinFloor: Math.min(...maxFptsList),
    avgMinutes: minutesList.reduce((a, b) => a + b, 0) / minutesList.length,
    totalGames,
    gamesPerWeek: totalGames / filteredWeeks.length,
    pct50plus: (games50plus / filteredGames.length) * 100,
    pct60plus: (games60plus / filteredGames.length) * 100,
    pctUnder35: (gamesUnder35 / filteredGames.length) * 100,
    weeks: filteredWeeks.length,
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

export default function PlayerDetail({ player, allPlayers, onBack, nbaSchedule, backLabel = 'Back to Players' }: Props) {
  const [activeTab, setActiveTab] = useState<TabType>('thisWeek');
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('all');
  const [selectedGameIdx, setSelectedGameIdx] = useState<number | null>(null); // null = auto (best game)

  const periodConfig = TIME_PERIODS.find(p => p.value === timePeriod)!;
  const filteredStats = useMemo(() => calcFilteredStats(player, periodConfig.weeks), [player, periodConfig.weeks]);

  // Prepare game log data
  const gameLogData = player.games.map(g => ({
    date: g.date,
    week: g.week,
    fpts: g.fpts,
    minutes: g.minutes,
    matchup: g.matchup,
    pts: g.pts,
    reb: g.reb,
    ast: g.ast,
    stl: g.stl,
    blk: g.blk,
  }));

  // Calculate consistency/volatility metrics with new reliability framework
  const consistencyMetrics = useMemo(() => {
    const maxFptsList = player.weeklyStats.map(w => w.maxFpts);
    if (maxFptsList.length === 0) return null;

    const totalWeeks = maxFptsList.length;
    const avg = maxFptsList.reduce((a, b) => a + b, 0) / totalWeeks;
    const variance = maxFptsList.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / totalWeeks;
    const stdDev = Math.sqrt(variance);

    // Median lock-in (more robust than average)
    const sortedMaxes = [...maxFptsList].sort((a, b) => a - b);
    const mid = Math.floor(sortedMaxes.length / 2);
    const medianLockin = sortedMaxes.length % 2 !== 0
      ? sortedMaxes[mid]
      : (sortedMaxes[mid - 1] + sortedMaxes[mid]) / 2;

    // NEW: Reliability metrics that matter for lock-in
    const weeks40plus = maxFptsList.filter(v => v >= 40).length;
    const weeks45plus = maxFptsList.filter(v => v >= 45).length;
    const weeks50plus = maxFptsList.filter(v => v >= 50).length;
    const weeksBust = maxFptsList.filter(v => v < 35).length;

    const pct40plus = (weeks40plus / totalWeeks) * 100;
    const pct45plus = (weeks45plus / totalWeeks) * 100;
    const pct50plus = (weeks50plus / totalWeeks) * 100;
    const pctBust = (weeksBust / totalWeeks) * 100;

    // Composite Reliability Score:
    // - 50% playable rate (40+)
    // - 30% confident lock rate (45+)
    // - 20% inverse bust rate
    const reliabilityScore = (pct40plus * 0.5) + (pct45plus * 0.3) + ((100 - pctBust) * 0.2);

    // Floor probability: % of weeks where lock-in was within 15% of floor
    const floorThreshold = player.lockinFloor * 1.15;
    const floorWeeks = maxFptsList.filter(v => v <= floorThreshold).length;
    const floorProbability = (floorWeeks / totalWeeks) * 100;

    // Ceiling probability: % of weeks where lock-in was within 15% of ceiling
    const ceilingThreshold = player.lockinCeiling * 0.85;
    const ceilingWeeks = maxFptsList.filter(v => v >= ceilingThreshold).length;
    const ceilingProbability = (ceilingWeeks / totalWeeks) * 100;

    // Upside metric: ceiling - average (how much upside they have)
    const upside = player.lockinCeiling - avg;
    const upsideRatio = avg > 0 ? (upside / avg) * 100 : 0;

    // Downside risk: average - floor
    const downside = avg - player.lockinFloor;
    const downsideRatio = avg > 0 ? (downside / avg) * 100 : 0;

    // Calculate distribution buckets for histogram - DYNAMIC based on player's range
    const minScore = Math.min(...maxFptsList);
    const maxScore = Math.max(...maxFptsList);
    const range = maxScore - minScore;

    // Create 6 buckets spanning the player's actual range
    const bucketSize = Math.ceil(range / 6);
    const bucketStart = Math.floor(minScore / 5) * 5; // Round down to nearest 5

    // Blue-accent gradient: from red (bad) through yellows to blues (good)
    const bucketColors = ['#ef4444', '#f59e0b', '#eab308', '#22c55e', '#3b82f6', '#6366f1'];
    const buckets: { range: string; count: number; color: string; label: string; min: number; max: number }[] = [];

    for (let i = 0; i < 6; i++) {
      const min = bucketStart + (i * bucketSize);
      const max = min + bucketSize;
      buckets.push({
        range: `${min}-${max}`,
        count: 0,
        color: bucketColors[i],
        label: i === 0 ? 'Low' : i === 5 ? 'High' : '',
        min,
        max,
      });
    }

    maxFptsList.forEach(v => {
      for (let i = buckets.length - 1; i >= 0; i--) {
        if (v >= buckets[i].min) {
          buckets[i].count++;
          break;
        }
      }
    });

    return {
      reliabilityScore,
      medianLockin,
      stdDev,
      pct40plus,
      pct45plus,
      pct50plus,
      pctBust,
      weeks40plus,
      weeks45plus,
      weeksBust,
      floorProbability,
      ceilingProbability,
      upside,
      upsideRatio,
      downside,
      downsideRatio,
      buckets,
      totalWeeks,
    };
  }, [player]);

  // Extract stats from consistencyMetrics with fallback values
  const stats = consistencyMetrics || {
    pct40plus: 0,
    pct45plus: 0,
    pctBust: 0,
    reliabilityScore: 0,
    medianLockin: 0,
    stdDev: 0,
    pct50plus: 0,
    weeks40plus: 0,
    weeks45plus: 0,
    weeksBust: 0,
    floorProbability: 0,
    ceilingProbability: 0,
    upside: 0,
    upsideRatio: 0,
    downside: 0,
    downsideRatio: 0,
    buckets: [],
    totalWeeks: 0,
  };

  // Weekly stats for charts
  const weeklyData = player.weeklyStats.map(w => ({
    week: `W${w.week}`,
    max: w.maxFpts,
    min: w.minFpts,
    avg: w.avgFpts,
    games: w.games,
    avgMin: w.avgMinutes,
  }));

  // Period comparison
  const periodData = [
    { period: 'Early (W1-4)', lockin: player.early.expectedLockin, avg: player.early.avgFpts, minutes: player.early.avgMinutes },
    { period: 'Mid (W5-8)', lockin: player.mid.expectedLockin, avg: player.mid.avgFpts, minutes: player.mid.avgMinutes },
    { period: 'Recent (W9+)', lockin: player.recent.expectedLockin, avg: player.recent.avgFpts, minutes: player.recent.avgMinutes },
  ];

  // League rank
  const sortedByLockin = [...allPlayers].sort((a, b) => b.expectedLockin - a.expectedLockin);
  const rank = sortedByLockin.findIndex(p => p.sleeper_id === player.sleeper_id) + 1;
  const percentile = ((allPlayers.length - rank) / allPlayers.length * 100).toFixed(0);

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'RISING': return <TrendingUp size={16} />;
      case 'FALLING': return <TrendingDown size={16} />;
      default: return <Minus size={16} />;
    }
  };

  // This Week data
  const remainingGames = getRemainingGames(player.nba_team, nbaSchedule);
  const weekEnd = nbaSchedule?.weekEnd || '';
  // Use actual current week from schedule (not from player data which may be outdated for injured players)
  const currentWeekNumber = nbaSchedule?.currentWeek || 13;

  // Get ACTUAL games played this week
  const thisWeekStats = player.weeklyStats.find(w => w.week === currentWeekNumber);
  const thisWeekGames = thisWeekStats?.gamesList || [];
  const bestGameThisWeek = thisWeekStats?.maxFpts || 0;
  const gamesPlayedThisWeek = thisWeekStats?.games || 0;

  // Selected game for lock advice calculation (null = auto select best)
  const selectedGame = selectedGameIdx !== null && thisWeekGames[selectedGameIdx]
    ? thisWeekGames[selectedGameIdx]
    : null;
  const currentLockScore = selectedGame ? selectedGame.fpts : bestGameThisWeek;
  const isManualSelection = selectedGameIdx !== null;

  // Recent form: get actual game logs from last 2 weeks
  const recentWeekNumbers = player.weeklyStats
    .filter(w => w.week < currentWeekNumber)
    .slice(-2)
    .map(w => w.week);
  const recentGames = player.games.filter(g => recentWeekNumbers.includes(g.week));
  const recentLockin = player.weeklyStats
    .filter(w => recentWeekNumbers.includes(w.week))
    .reduce((sum, w) => sum + w.maxFpts, 0) / Math.max(recentWeekNumbers.length, 1);

  // Is player injured?
  const isInjured = player.injury_status && ['OUT', 'OFS', 'SUS'].includes(player.injury_status);
  const isQuestionable = player.injury_status && ['GTD', 'QUESTIONABLE', 'DOUBTFUL'].includes(player.injury_status);

  // Lock-in decision calculation with MATH
  const getLockAdvice = () => {
    // If injured/out, show that
    if (isInjured) {
      if (gamesPlayedThisWeek > 0) {
        return {
          verdict: 'LOCK',
          reason: `Player is ${player.injury_status}. Best available: ${bestGameThisWeek.toFixed(1)}`,
          icon: XCircle,
          color: '#ef4444',
          math: null,
          isManual: false
        };
      }
      return {
        verdict: 'N/A',
        reason: `Player is ${player.injury_status} - no games this week`,
        icon: XCircle,
        color: '#6b7280',
        math: null,
        isManual: false
      };
    }

    // No games played yet
    if (gamesPlayedThisWeek === 0) {
      return {
        verdict: 'WAIT',
        reason: `No games played yet. ${remainingGames.count} game(s) remaining.`,
        icon: AlertCircle,
        color: '#f59e0b',
        math: null,
        isManual: false
      };
    }

    // Use currentLockScore (either manually selected or best game)
    const scoreToEvaluate = currentLockScore;

    // Calculate probability of beating current selection
    const weeklyMaxes = player.weeklyStats.map(w => w.maxFpts);
    const weeksBeatingCurrent = weeklyMaxes.filter(m => m > scoreToEvaluate).length;
    const probBeatCurrent = (weeksBeatingCurrent / weeklyMaxes.length) * 100;

    // Per-game probability of beating current selection
    const allGameFpts = player.games.map(g => g.fpts);
    const gamesBeatingCurrent = allGameFpts.filter(f => f > scoreToEvaluate).length;
    const perGameProbBeat = (gamesBeatingCurrent / allGameFpts.length) * 100;

    // Combined probability: chance of beating current in remaining games
    // P(at least one game beats current) = 1 - P(all games fail to beat)
    const probAllFail = Math.pow(1 - (perGameProbBeat / 100), remainingGames.count);
    const probImprove = (1 - probAllFail) * 100;

    // How close is current selection to ceiling?
    const ceilingProximity = (scoreToEvaluate / player.lockinCeiling) * 100;
    const isNearCeiling = ceilingProximity >= 85;

    // Is current selection better than expected?
    const aboveExpected = scoreToEvaluate > player.expectedLockin;

    const math = {
      probBeatCurrent: probBeatCurrent.toFixed(0),
      perGameProbBeat: perGameProbBeat.toFixed(0),
      probImprove: probImprove.toFixed(0),
      ceilingProximity: ceilingProximity.toFixed(0),
      gamesLeft: remainingGames.count,
      selectedScore: scoreToEvaluate.toFixed(1)
    };

    // Decision logic
    if (remainingGames.count === 0) {
      return {
        verdict: 'LOCK',
        reason: `No more games. Lock at ${scoreToEvaluate.toFixed(1)}.`,
        icon: scoreToEvaluate >= 40 ? CheckCircle : XCircle,
        color: scoreToEvaluate >= 45 ? '#22c55e' : scoreToEvaluate >= 40 ? '#84cc16' : '#ef4444',
        math,
        isManual: isManualSelection
      };
    }

    if (isNearCeiling) {
      return {
        verdict: 'LOCK',
        reason: `${scoreToEvaluate.toFixed(1)} is ${ceilingProximity.toFixed(0)}% of ceiling (${player.lockinCeiling.toFixed(1)}). Hard to beat.`,
        icon: CheckCircle,
        color: '#22c55e',
        math,
        isManual: isManualSelection
      };
    }

    if (probImprove < 20) {
      return {
        verdict: 'LOCK',
        reason: `Only ${probImprove.toFixed(0)}% chance to beat ${scoreToEvaluate.toFixed(1)} in ${remainingGames.count} game(s).`,
        icon: CheckCircle,
        color: '#22c55e',
        math,
        isManual: isManualSelection
      };
    }

    if (probImprove >= 50 && !aboveExpected) {
      return {
        verdict: 'WAIT',
        reason: `${probImprove.toFixed(0)}% chance to beat ${scoreToEvaluate.toFixed(1)}. Current is below expected (${player.expectedLockin.toFixed(1)}).`,
        icon: AlertCircle,
        color: '#f59e0b',
        math,
        isManual: isManualSelection
      };
    }

    if (probImprove >= 35) {
      return {
        verdict: 'WAIT',
        reason: `${probImprove.toFixed(0)}% chance to improve with ${remainingGames.count} game(s) left.`,
        icon: AlertCircle,
        color: '#f59e0b',
        math,
        isManual: isManualSelection
      };
    }

    return {
      verdict: 'LOCK',
      reason: `${scoreToEvaluate.toFixed(1)} is solid. Only ${probImprove.toFixed(0)}% chance to improve.`,
      icon: CheckCircle,
      color: aboveExpected ? '#22c55e' : '#84cc16',
      math,
      isManual: isManualSelection
    };
  };

  const lockAdvice = getLockAdvice();

  return (
    <motion.div
      className="player-detail"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Header */}
      <div className="detail-header">
        <button className="btn btn-ghost back-btn" onClick={onBack}>
          <ArrowLeft size={18} />
          {backLabel}
        </button>
      </div>

      {/* Player Info */}
      <div className="player-hero">
        <div className="hero-main">
          <h1 className="hero-name">{player.player}</h1>
          <div className="hero-meta">
            <span className="player-position">{player.position}</span>
            <span className="hero-team">{player.nba_team}</span>
            <span className="hero-fantasy">@ {player.fantasy_team}</span>
            {player.injury_status && (
              <span className={`injury-badge ${player.injury_status.toLowerCase()}`}>
                {player.injury_status}
              </span>
            )}
          </div>
        </div>
        <div className="hero-rank">
          <span className="rank-number">#{rank}</span>
          <span className="rank-label">Lock-In Rank</span>
          <span className="rank-percentile">Top {percentile}%</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="detail-tabs">
        <button
          className={`detail-tab ${activeTab === 'thisWeek' ? 'active' : ''}`}
          onClick={() => setActiveTab('thisWeek')}
        >
          <CalendarDays size={18} />
          This Week
        </button>
        <button
          className={`detail-tab ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          <User size={18} />
          Full Profile
        </button>
      </div>

      {/* This Week Tab */}
      {activeTab === 'thisWeek' && (
        <div className="this-week-content">
          {/* Injury Alert Banner */}
          {isInjured && (
            <div className="injury-alert-banner">
              <XCircle size={24} />
              <div className="injury-alert-content">
                <span className="injury-alert-status">{player.injury_status}</span>
                <span className="injury-alert-msg">This player is currently out and will not play.</span>
              </div>
            </div>
          )}
          {isQuestionable && (
            <div className="injury-alert-banner questionable">
              <AlertCircle size={24} />
              <div className="injury-alert-content">
                <span className="injury-alert-status">{player.injury_status}</span>
                <span className="injury-alert-msg">Game status uncertain. Monitor before locking.</span>
              </div>
            </div>
          )}

          {/* Lock Advice Card with Math */}
          <div className="lock-advice-card" style={{ borderColor: lockAdvice.color }}>
            <div className="advice-header">
              <lockAdvice.icon size={32} style={{ color: lockAdvice.color }} />
              <div className="advice-verdict" style={{ color: lockAdvice.color }}>
                {lockAdvice.verdict}
              </div>
            </div>
            <div className="advice-reason">{lockAdvice.reason}</div>
            {lockAdvice.math && (
              <div className="advice-math">
                <div className="math-row">
                  <span className="math-label">Current Best vs Ceiling:</span>
                  <span className="math-value">{lockAdvice.math.ceilingProximity}%</span>
                </div>
                <div className="math-row">
                  <span className="math-label">% of games that beat current:</span>
                  <span className="math-value">{lockAdvice.math.perGameProbBeat}%</span>
                </div>
                <div className="math-row highlight">
                  <span className="math-label">Chance to improve ({lockAdvice.math.gamesLeft} game{lockAdvice.math.gamesLeft !== 1 ? 's' : ''}):</span>
                  <span className="math-value">{lockAdvice.math.probImprove}%</span>
                </div>
              </div>
            )}
          </div>

          {/* This Week's Games - ACTUAL GAME LOG */}
          <div className="this-week-games-card">
            <div className="games-card-header">
              <h3>Week {currentWeekNumber} Games</h3>
              {thisWeekGames.length > 1 && (
                <span className="games-select-hint">Click a game to simulate lock</span>
              )}
            </div>
            {thisWeekGames.length > 0 ? (
              <div className="week-games-table">
                <table>
                  <thead>
                    <tr>
                      <th></th>
                      <th>Date</th>
                      <th>Matchup</th>
                      <th>MIN</th>
                      <th>FPTS</th>
                      <th>PTS</th>
                      <th>REB</th>
                      <th>AST</th>
                    </tr>
                  </thead>
                  <tbody>
                    {thisWeekGames.map((game, idx) => {
                      const isBest = game.fpts === bestGameThisWeek;
                      const isSelected = selectedGameIdx === idx;
                      const isActiveForCalc = isSelected || (selectedGameIdx === null && isBest);
                      return (
                        <tr
                          key={idx}
                          className={`${isBest ? 'best-game' : ''} ${isSelected ? 'selected-game' : ''} ${isActiveForCalc ? 'active-calc' : ''} clickable-row`}
                          onClick={() => setSelectedGameIdx(isSelected ? null : idx)}
                        >
                          <td className="select-col">
                            <span className={`game-select-indicator ${isActiveForCalc ? 'active' : ''}`}>
                              {isActiveForCalc ? '●' : '○'}
                            </span>
                          </td>
                          <td>{game.date.slice(5)}</td>
                          <td>{game.matchup}</td>
                          <td>{game.minutes}</td>
                          <td className={`fpts-cell ${game.fpts >= 50 ? 'elite' : game.fpts >= 40 ? 'good' : game.fpts < 30 ? 'bad' : ''}`}>
                            {game.fpts.toFixed(1)}
                            {isBest && <span className="best-badge">BEST</span>}
                          </td>
                          <td>{game.pts}</td>
                          <td>{game.reb}</td>
                          <td>{game.ast}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="no-games-yet">
                {isInjured ? 'No games - player is OUT' : 'No games played yet this week'}
              </div>
            )}
          </div>

          {/* Week Summary Stats */}
          <div className="week-summary-grid">
            <div className="week-stat-card">
              <div className="week-stat-label">Best This Week</div>
              <div className={`week-stat-value ${bestGameThisWeek >= 45 ? 'great' : bestGameThisWeek >= 40 ? 'good' : bestGameThisWeek > 0 ? 'low' : ''}`}>
                {bestGameThisWeek > 0 ? bestGameThisWeek.toFixed(1) : '—'}
              </div>
              <div className="week-stat-sub">
                {bestGameThisWeek > 0 && (
                  <>vs ceiling {player.lockinCeiling.toFixed(1)} ({((bestGameThisWeek / player.lockinCeiling) * 100).toFixed(0)}%)</>
                )}
              </div>
            </div>

            <div className="week-stat-card">
              <div className="week-stat-label">Games Remaining</div>
              <div className={`week-stat-value ${remainingGames.count >= 3 ? 'great' : remainingGames.count >= 2 ? 'good' : remainingGames.count > 0 ? 'low' : ''}`}>
                {remainingGames.count}
              </div>
              <div className="week-stat-sub">through {weekEnd}</div>
            </div>

            <div className="week-stat-card">
              <div className="week-stat-label">Exp. Lock-In</div>
              <div className="week-stat-value">{player.expectedLockin.toFixed(1)}</div>
              <div className="week-stat-sub">Range: {player.lockinFloor.toFixed(0)} - {player.lockinCeiling.toFixed(0)}</div>
            </div>

            <div className="week-stat-card">
              <div className="week-stat-label">Season Reliability</div>
              <div className={`week-stat-value ${stats.pct45plus >= 70 ? 'great' : stats.pct45plus >= 50 ? 'good' : 'low'}`}>
                {stats.pct45plus.toFixed(0)}%
              </div>
              <div className="week-stat-sub">weeks with 45+ game</div>
            </div>
          </div>

          {/* Upcoming Games */}
          {remainingGames.count > 0 && (
            <div className="upcoming-games-card">
              <h3>Remaining Games This Week</h3>
              <div className="upcoming-games-list">
                {remainingGames.games.map((game, idx) => (
                  <div key={idx} className="upcoming-game">
                    <span className="game-date">{game.date.slice(5)}</span>
                    <span className="game-matchup">
                      {game.home ? 'vs' : '@'} {game.opponent}
                    </span>
                    <span className={`game-location ${game.home ? 'home' : 'away'}`}>
                      {game.home ? 'HOME' : 'AWAY'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Form - Last 2 Weeks Game Log */}
          {recentGames.length > 0 && (
            <div className="recent-form-card">
              <h3>Recent Form (Last 2 Weeks)</h3>
              <div className="recent-form-summary">
                <span>Avg Lock-In: <strong>{recentLockin.toFixed(1)}</strong></span>
                <span className={recentLockin > player.expectedLockin ? 'hot' : recentLockin < player.expectedLockin ? 'cold' : ''}>
                  {recentLockin > player.expectedLockin ? '↑ Hot' : recentLockin < player.expectedLockin ? '↓ Cold' : '→ Normal'} vs {player.expectedLockin.toFixed(1)} season
                </span>
              </div>
              <div className="recent-games-list">
                {recentGames.slice(-6).map((game, idx) => {
                  // Format date as "Jan 5" style
                  const dateObj = new Date(game.date);
                  const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  return (
                    <div key={idx} className="recent-game-row">
                      <span className="rg-date">{formattedDate}</span>
                      <span className="rg-matchup">{game.matchup}</span>
                      <span className={`rg-fpts ${game.fpts >= 50 ? 'elite' : game.fpts >= 40 ? 'good' : game.fpts < 30 ? 'bad' : ''}`}>
                        {game.fpts.toFixed(1)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick Reliability Stats */}
          <div className="quick-reliability">
            <h3>Season Reliability</h3>
            <div className="reliability-quick-grid">
              <div className="reliability-quick-stat">
                <span className="rq-value">{stats.pct40plus.toFixed(0)}%</span>
                <span className="rq-label">40+ weeks</span>
              </div>
              <div className="reliability-quick-stat">
                <span className="rq-value">{stats.pct45plus.toFixed(0)}%</span>
                <span className="rq-label">45+ weeks</span>
              </div>
              <div className="reliability-quick-stat">
                <span className="rq-value">{stats.pctBust.toFixed(0)}%</span>
                <span className="rq-label">Bust weeks</span>
              </div>
              <div className="reliability-quick-stat">
                <span className="rq-value">{player.lockinCeiling.toFixed(0)}</span>
                <span className="rq-label">Ceiling</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full Profile Tab */}
      {activeTab === 'profile' && (
        <>
          {/* Time Period Filter */}
          <div className="period-filter-bar">
            <span className="period-filter-label">Stats Period:</span>
            <div className="period-filter-buttons">
              {TIME_PERIODS.map(p => (
                <button
                  key={p.value}
                  className={`period-filter-btn ${timePeriod === p.value ? 'active' : ''}`}
                  onClick={() => setTimePeriod(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {timePeriod !== 'all' && (
              <span className="period-filter-info">
                {filteredStats.weeks} weeks, {filteredStats.totalGames} games
              </span>
            )}
          </div>

          {/* Stats Grid */}
          <div className="stats-grid">
            <div className="stat-card primary">
              <div className="stat-icon">
                <Target size={24} />
              </div>
              <div className="stat-content">
                <span className="stat-value">{filteredStats.expectedLockin.toFixed(1)}</span>
                <span className="stat-label">Expected Lock-In</span>
                {timePeriod === 'all' ? (
                  <span className={`stat-trend ${player.lockinTrend.toLowerCase()}`}>
                    {getTrendIcon(player.lockinTrend)}
                    {player.lockinTrendPct > 0 ? '+' : ''}{player.lockinTrendPct.toFixed(1)}% vs early
                  </span>
                ) : (
                  <span className="stat-sub">
                    Season: {player.expectedLockin.toFixed(1)}
                  </span>
                )}
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon blue">
                <Activity size={24} />
              </div>
              <div className="stat-content">
                <span className="stat-value">{filteredStats.avgFpts.toFixed(1)}</span>
                <span className="stat-label">Avg Fantasy Points</span>
                <span className="stat-sub">Med: {filteredStats.medianFpts.toFixed(1)} | Std: {filteredStats.stdFpts.toFixed(1)}</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon green">
                <BarChart3 size={24} />
              </div>
              <div className="stat-content">
                <span className="stat-value">{filteredStats.lockinCeiling.toFixed(1)}</span>
                <span className="stat-label">Lock-In Ceiling</span>
                <span className="stat-sub">Floor: {filteredStats.lockinFloor.toFixed(1)}</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon orange">
                <Clock size={24} />
              </div>
              <div className="stat-content">
                <span className="stat-value">{filteredStats.avgMinutes.toFixed(1)}</span>
                <span className="stat-label">Avg Minutes</span>
                {timePeriod === 'all' ? (
                  <span className={`stat-trend ${player.minutesTrend === 'MORE_MINUTES' ? 'rising' : player.minutesTrend === 'FEWER_MINUTES' ? 'falling' : 'stable'}`}>
                    {player.minutesTrend.replace('_', ' ')}
                  </span>
                ) : (
                  <span className="stat-sub">
                    Season: {player.avgMinutes.toFixed(1)}
                  </span>
                )}
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon purple">
                <Calendar size={24} />
              </div>
              <div className="stat-content">
                <span className="stat-value">{filteredStats.totalGames}</span>
                <span className="stat-label">Games Played</span>
                <span className="stat-sub">{filteredStats.gamesPerWeek.toFixed(1)} per week</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-content">
                <span className="stat-value">{filteredStats.pct50plus.toFixed(0)}%</span>
                <span className="stat-label">Games 50+ FPTS</span>
                <span className="stat-sub">60+: {filteredStats.pct60plus.toFixed(0)}% | &lt;35: {filteredStats.pctUnder35.toFixed(0)}%</span>
              </div>
            </div>
          </div>

      {/* Charts Row */}
      <div className="charts-row">
        {/* Week by Week Lock-In */}
        <div className="card chart-card">
          <div className="card-header">
            <h3 className="card-title">
              <Target size={18} />
              Weekly Lock-In Value
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={weeklyData}>
              <defs>
                <linearGradient id="colorMax" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="week" stroke="#64748b" fontSize={11} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                }}
              />
              <ReferenceLine y={player.expectedLockin} stroke="#6366f1" strokeDasharray="5 5" />
              <Area type="monotone" dataKey="max" fill="url(#colorMax)" stroke="#22c55e" strokeWidth={2} name="Max FPTS" />
              <Line type="monotone" dataKey="avg" stroke="#64748b" strokeWidth={1} strokeDasharray="3 3" name="Avg FPTS" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Minutes Trend */}
        <div className="card chart-card">
          <div className="card-header">
            <h3 className="card-title">
              <Clock size={18} />
              Minutes Trend
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={gameLogData}>
              <defs>
                <linearGradient id="colorMin" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickLine={false} interval="preserveStartEnd" />
              <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} domain={[0, 'auto']} />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                }}
              />
              <ReferenceLine y={player.avgMinutes} stroke="#f59e0b" strokeDasharray="5 5" />
              <Area type="monotone" dataKey="minutes" fill="url(#colorMin)" stroke="#f59e0b" strokeWidth={2} name="Minutes" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Period Comparison */}
      <div className="card period-card">
        <div className="card-header">
          <h3 className="card-title">
            <Activity size={18} />
            Period Analysis
          </h3>
        </div>
        <div className="period-grid">
          {periodData.map((p, i) => (
            <div key={i} className={`period-item ${i === 2 ? 'recent' : ''}`}>
              <h4 className="period-name">{p.period}</h4>
              <div className="period-stats">
                <div className="period-stat">
                  <span className="period-value">{p.lockin.toFixed(1)}</span>
                  <span className="period-label">Lock-In</span>
                </div>
                <div className="period-stat">
                  <span className="period-value">{p.avg.toFixed(1)}</span>
                  <span className="period-label">Avg FPTS</span>
                </div>
                <div className="period-stat">
                  <span className="period-value">{p.minutes.toFixed(1)}</span>
                  <span className="period-label">Avg MIN</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Manager Confidence & Reliability Metrics */}
      {consistencyMetrics && (
        <div className="consistency-section">
          <div className="card consistency-card">
            <div className="card-header">
              <h3 className="card-title">
                <Gauge size={18} />
                Manager Confidence
              </h3>
            </div>
            <div className="consistency-content">
              {/* Main Reliability Score */}
              <div className="consistency-score-container">
                <div className="consistency-gauge">
                  <div
                    className="gauge-fill"
                    style={{
                      width: `${consistencyMetrics.reliabilityScore}%`,
                      background: consistencyMetrics.reliabilityScore >= 70
                        ? 'var(--accent-green)'
                        : consistencyMetrics.reliabilityScore >= 45
                        ? 'var(--accent-yellow)'
                        : 'var(--accent-red)',
                    }}
                  />
                </div>
                <div className="consistency-score-info">
                  <span className="consistency-score-value">{consistencyMetrics.reliabilityScore.toFixed(0)}</span>
                  <span className="consistency-score-label">Reliability Score</span>
                  <span className="consistency-score-desc">
                    {consistencyMetrics.reliabilityScore >= 70
                      ? 'Highly Reliable - Lock with Confidence'
                      : consistencyMetrics.reliabilityScore >= 45
                      ? 'Moderate - Situational Locks'
                      : 'Low Reliability - Risky Starter'}
                  </span>
                </div>
              </div>

              {/* Key Reliability Metrics */}
              <div className="reliability-metrics-grid">
                <div className="reliability-metric playable">
                  <div className="metric-header">
                    <span className="metric-value">{consistencyMetrics.pct40plus.toFixed(0)}%</span>
                    <span className="metric-label">Playable Rate</span>
                  </div>
                  <div className="metric-detail">
                    <span className="metric-weeks">{consistencyMetrics.weeks40plus}/{consistencyMetrics.totalWeeks} weeks</span>
                    <span className="metric-desc">Had a 40+ game</span>
                  </div>
                  <div className="metric-bar">
                    <div className="metric-bar-fill" style={{ width: `${consistencyMetrics.pct40plus}%`, background: '#22c55e' }} />
                  </div>
                </div>

                <div className="reliability-metric confident">
                  <div className="metric-header">
                    <span className="metric-value">{consistencyMetrics.pct45plus.toFixed(0)}%</span>
                    <span className="metric-label">Confident Lock Rate</span>
                  </div>
                  <div className="metric-detail">
                    <span className="metric-weeks">{consistencyMetrics.weeks45plus}/{consistencyMetrics.totalWeeks} weeks</span>
                    <span className="metric-desc">Had a 45+ game</span>
                  </div>
                  <div className="metric-bar">
                    <div className="metric-bar-fill" style={{ width: `${consistencyMetrics.pct45plus}%`, background: '#6366f1' }} />
                  </div>
                </div>

                <div className="reliability-metric boom">
                  <div className="metric-header">
                    <span className="metric-value">{consistencyMetrics.pct50plus.toFixed(0)}%</span>
                    <span className="metric-label">Boom Rate</span>
                  </div>
                  <div className="metric-detail">
                    <span className="metric-weeks">{Math.round(consistencyMetrics.pct50plus * consistencyMetrics.totalWeeks / 100)}/{consistencyMetrics.totalWeeks} weeks</span>
                    <span className="metric-desc">Had a 50+ game</span>
                  </div>
                  <div className="metric-bar">
                    <div className="metric-bar-fill" style={{ width: `${consistencyMetrics.pct50plus}%`, background: '#10b981' }} />
                  </div>
                </div>

                <div className="reliability-metric bust">
                  <div className="metric-header">
                    <span className="metric-value">{consistencyMetrics.pctBust.toFixed(0)}%</span>
                    <span className="metric-label">Bust Rate</span>
                  </div>
                  <div className="metric-detail">
                    <span className="metric-weeks">{consistencyMetrics.weeksBust}/{consistencyMetrics.totalWeeks} weeks</span>
                    <span className="metric-desc">Under 35 (unplayable)</span>
                  </div>
                  <div className="metric-bar bust-bar">
                    <div className="metric-bar-fill" style={{ width: `${consistencyMetrics.pctBust}%`, background: '#ef4444' }} />
                  </div>
                </div>
              </div>

              {/* Additional Stats */}
              <div className="probability-grid">
                <div className="probability-card median-prob">
                  <div className="prob-icon">
                    <Target size={20} />
                  </div>
                  <div className="prob-content">
                    <span className="prob-value">{consistencyMetrics.medianLockin.toFixed(1)}</span>
                    <span className="prob-label">Median Lock-In</span>
                    <span className="prob-desc">More robust than average ({player.expectedLockin.toFixed(1)})</span>
                  </div>
                </div>

                <div className="probability-card ceiling-prob">
                  <div className="prob-icon">
                    <Zap size={20} />
                  </div>
                  <div className="prob-content">
                    <span className="prob-value">{consistencyMetrics.ceilingProbability.toFixed(0)}%</span>
                    <span className="prob-label">Ceiling Probability</span>
                    <span className="prob-desc">
                      Weeks near ceiling ({player.lockinCeiling.toFixed(0)}+)
                    </span>
                  </div>
                </div>

                <div className="probability-card floor-prob">
                  <div className="prob-icon">
                    <Shield size={20} />
                  </div>
                  <div className="prob-content">
                    <span className="prob-value">{consistencyMetrics.floorProbability.toFixed(0)}%</span>
                    <span className="prob-label">Floor Probability</span>
                    <span className="prob-desc">
                      Weeks near floor ({player.lockinFloor.toFixed(0)}-)
                    </span>
                  </div>
                </div>

                <div className="probability-card stddev-prob">
                  <div className="prob-icon">
                    <Activity size={20} />
                  </div>
                  <div className="prob-content">
                    <span className="prob-value">{consistencyMetrics.stdDev.toFixed(1)}</span>
                    <span className="prob-label">Std Deviation</span>
                    <span className="prob-desc">Weekly lock-in volatility</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Distribution Histogram */}
          <div className="card distribution-card">
            <div className="card-header">
              <h3 className="card-title">
                <BarChart3 size={18} />
                Lock-In Distribution ({consistencyMetrics.totalWeeks} weeks)
              </h3>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={consistencyMetrics.buckets}>
                <XAxis dataKey="range" stroke="var(--text-muted)" fontSize={11} tickLine={false} />
                <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: 'var(--text-primary)',
                  }}
                  formatter={(value) => {
                    const v = typeof value === 'number' ? value : 0;
                    return [`${v} week${v !== 1 ? 's' : ''} (${((v / consistencyMetrics.totalWeeks) * 100).toFixed(0)}%)`, 'Count'];
                  }}
                />
                <Bar dataKey="count" name="Weeks" radius={[4, 4, 0, 0]}>
                  {consistencyMetrics.buckets.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="distribution-legend">
              <span className="legend-item">
                <span className="legend-color" style={{ background: '#ef4444' }} />
                Bust (&lt;35)
              </span>
              <span className="legend-item">
                <span className="legend-color" style={{ background: '#f59e0b' }} />
                Unplayable (35-40)
              </span>
              <span className="legend-item">
                <span className="legend-color" style={{ background: '#eab308' }} />
                Playable (40-45)
              </span>
              <span className="legend-item">
                <span className="legend-color" style={{ background: '#22c55e' }} />
                Good Lock (45-50)
              </span>
              <span className="legend-item">
                <span className="legend-color" style={{ background: '#3b82f6' }} />
                Great (50-55)
              </span>
              <span className="legend-item">
                <span className="legend-color" style={{ background: '#6366f1' }} />
                Elite (55+)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Game Log */}
      <div className="card gamelog-card">
        <div className="card-header">
          <h3 className="card-title">
            <Calendar size={18} />
            Game Log ({player.games.length} games)
          </h3>
        </div>
        <div className="table-wrapper">
          <table className="data-table gamelog-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Week</th>
                <th>Matchup</th>
                <th>MIN</th>
                <th>FPTS</th>
                <th>PTS</th>
                <th>REB</th>
                <th>AST</th>
                <th>STL</th>
                <th>BLK</th>
              </tr>
            </thead>
            <tbody>
              {[...player.games].reverse().map((game, idx) => {
                const isWeekMax = player.weeklyStats.find(w => w.week === game.week)?.maxFpts === game.fpts;
                return (
                  <tr key={idx} className={isWeekMax ? 'week-max' : ''}>
                    <td>{game.date}</td>
                    <td>W{game.week}</td>
                    <td>{game.matchup}</td>
                    <td>{game.minutes}</td>
                    <td className={`fpts-cell ${game.fpts >= 50 ? 'elite' : game.fpts >= 40 ? 'good' : game.fpts < 30 ? 'bad' : ''}`}>
                      {game.fpts.toFixed(1)}
                      {isWeekMax && <span className="max-badge">MAX</span>}
                    </td>
                    <td>{game.pts}</td>
                    <td>{game.reb}</td>
                    <td>{game.ast}</td>
                    <td>{game.stl}</td>
                    <td>{game.blk}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}
    </motion.div>
  );
}

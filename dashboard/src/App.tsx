import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Users,
  TrendingUp,
  ArrowLeftRight,
  Zap,
  Swords,
  Loader2,
  Trophy,
  Sun,
  Moon,
  RefreshCw,
} from 'lucide-react';
import { loadGames, loadRosters, loadAllPlayers, loadNBASchedule, type SleeperPlayer, type NBASchedule } from './lib/dataLoader';
import { computePlayerAnalytics, computeTeamAnalytics } from './lib/analytics';
import type { Game, PlayerAnalytics, TeamAnalytics, ViewType, Roster } from './types';
import Dashboard from './components/Dashboard';
import PlayersView from './components/PlayersView';
import TeamsView from './components/TeamsView';
import TradeMachine from './components/TradeMachine';
import StreamingPanel from './components/StreamingPanel';
import HeadToHead from './components/HeadToHead';
import PlayerDetail from './components/PlayerDetail';
import TeamDetail from './components/TeamDetail';
import './App.css';

function App() {
  const [games, setGames] = useState<Game[]>([]);
  const [rosters, setRosters] = useState<Roster[]>([]);
  const [players, setPlayers] = useState<PlayerAnalytics[]>([]);
  const [teams, setTeams] = useState<TeamAnalytics[]>([]);
  const [allNbaPlayers, setAllNbaPlayers] = useState<Record<string, SleeperPlayer>>({});
  const [nbaSchedule, setNbaSchedule] = useState<NBASchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewType>('dashboard');
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerAnalytics | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<TeamAnalytics | null>(null);
  const [weekFilter, setWeekFilter] = useState<number[]>([]);
  const [previousView, setPreviousView] = useState<ViewType | null>(null); // Track where user came from
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('sleepr-theme');
    return (saved as 'dark' | 'light') || 'dark';
  });
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sleepr-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);

    try {
      // Add cache-busting timestamp to force fresh fetch
      const timestamp = Date.now();
      const [gamesData, rostersData, allPlayersData, scheduleData] = await Promise.all([
        fetch(`/games.csv?t=${timestamp}`).then(r => r.text()).then(text => {
          // Parse CSV manually to match loadGames format
          const lines = text.trim().split('\n');
          const headers = lines[0].split(',');
          return lines.slice(1).map(line => {
            const values = line.split(',');
            const game: Record<string, string | number> = {};
            headers.forEach((h, i) => {
              game[h] = values[i];
            });
            return game as unknown as Game;
          });
        }),
        fetch(`/rosters.json?t=${timestamp}`).then(r => r.json()),
        fetch(`/all_players.json?t=${timestamp}`).then(r => r.json()),
        fetch(`/schedule.json?t=${timestamp}`).then(r => r.json()),
      ]);

      setGames(gamesData);
      setRosters(rostersData);
      setAllNbaPlayers(allPlayersData);
      setNbaSchedule(scheduleData);

      const playerAnalytics = computePlayerAnalytics(gamesData, rostersData, allPlayersData);
      const teamAnalytics = computeTeamAnalytics(playerAnalytics, rostersData);

      setPlayers(playerAnalytics);
      setTeams(teamAnalytics);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Refresh failed:', err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    async function init() {
      try {
        const [gamesData, rostersData, allPlayersData, scheduleData] = await Promise.all([
          loadGames(),
          loadRosters(),
          loadAllPlayers(),
          loadNBASchedule(),
        ]);
        setGames(gamesData);
        setRosters(rostersData);
        setAllNbaPlayers(allPlayersData);
        setNbaSchedule(scheduleData);

        const playerAnalytics = computePlayerAnalytics(gamesData, rostersData, allPlayersData);
        const teamAnalytics = computeTeamAnalytics(playerAnalytics, rostersData);

        setPlayers(playerAnalytics);
        setTeams(teamAnalytics);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
        setLoading(false);
      }
    }
    init();
  }, []);

  const handlePlayerSelect = (player: PlayerAnalytics) => {
    // Track where we came from before going to player-detail
    setPreviousView(view);
    setSelectedPlayer(player);
    setView('player-detail');
  };

  const handleBackFromPlayer = () => {
    setSelectedPlayer(null);
    // Go back to wherever we came from
    if (previousView === 'team-detail' && selectedTeam) {
      setView('team-detail');
    } else if (previousView === 'teams') {
      setView('teams');
    } else if (previousView === 'dashboard') {
      setView('dashboard');
    } else if (previousView === 'streaming') {
      setView('streaming');
    } else if (previousView === 'h2h') {
      setView('h2h');
    } else if (previousView === 'trade') {
      setView('trade');
    } else {
      setView('players');
    }
    setPreviousView(null);
  };

  const handleTeamSelect = (team: TeamAnalytics) => {
    setPreviousView(view);
    setSelectedTeam(team);
    setView('team-detail');
  };

  const handleBackFromTeam = () => {
    setSelectedTeam(null);
    // Go back to wherever we came from
    if (previousView === 'dashboard') {
      setView('dashboard');
    } else {
      setView('teams');
    }
    setPreviousView(null);
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        >
          <Loader2 size={48} />
        </motion.div>
        <motion.h2
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          Loading Fantasy Data
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          Processing {games.length > 0 ? `${games.length} games` : 'game logs'}...
        </motion.p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-screen">
        <h2>Error Loading Data</h2>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <Trophy className="logo-icon" />
          <h1>SLEEPR</h1>
          <span className="subtitle">Lock-In Analytics</span>
        </div>
        <div className="header-right">
          <div className="header-stats">
            <div className="stat-pill">
              <span className="stat-label">Players</span>
              <span className="stat-value">{players.length}</span>
            </div>
            <div className="stat-pill">
              <span className="stat-label">Games</span>
              <span className="stat-value">{games.length.toLocaleString()}</span>
            </div>
            <div className="stat-pill">
              <span className="stat-label">Weeks</span>
              <span className="stat-value">13</span>
            </div>
          </div>
          <button
            className={`refresh-btn ${refreshing ? 'refreshing' : ''}`}
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label="Refresh data"
            title={lastRefresh ? `Last refresh: ${lastRefresh.toLocaleTimeString()}` : 'Refresh data'}
          >
            <RefreshCw size={18} className={refreshing ? 'spin' : ''} />
          </button>
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>

      {/* Navigation */}
      <nav className="nav">
        <button
          className={`nav-btn ${view === 'dashboard' ? 'active' : ''}`}
          onClick={() => setView('dashboard')}
        >
          <LayoutDashboard size={18} />
          <span>Dashboard</span>
        </button>
        <button
          className={`nav-btn ${view === 'players' || view === 'player-detail' ? 'active' : ''}`}
          onClick={() => setView('players')}
        >
          <Users size={18} />
          <span>Players</span>
        </button>
        <button
          className={`nav-btn ${view === 'teams' || view === 'team-detail' ? 'active' : ''}`}
          onClick={() => setView('teams')}
        >
          <TrendingUp size={18} />
          <span>Teams</span>
        </button>
        <button
          className={`nav-btn ${view === 'trade' ? 'active' : ''}`}
          onClick={() => setView('trade')}
        >
          <ArrowLeftRight size={18} />
          <span>Trade Machine</span>
        </button>
        <button
          className={`nav-btn ${view === 'streaming' ? 'active' : ''}`}
          onClick={() => setView('streaming')}
        >
          <Zap size={18} />
          <span>Streaming</span>
        </button>
        <button
          className={`nav-btn ${view === 'h2h' ? 'active' : ''}`}
          onClick={() => setView('h2h')}
        >
          <Swords size={18} />
          <span>H2H</span>
        </button>
      </nav>

      {/* Main Content */}
      <main className="main">
        <AnimatePresence mode="wait">
          {view === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
            >
              <Dashboard
                players={players}
                teams={teams}
                onPlayerSelect={handlePlayerSelect}
              />
            </motion.div>
          )}
          {view === 'players' && (
            <motion.div
              key="players"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
            >
              <PlayersView
                players={players}
                weekFilter={weekFilter}
                onWeekFilterChange={setWeekFilter}
                onPlayerSelect={handlePlayerSelect}
                nbaSchedule={nbaSchedule}
              />
            </motion.div>
          )}
          {view === 'player-detail' && selectedPlayer && (
            <motion.div
              key="player-detail"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
            >
              <PlayerDetail
                player={selectedPlayer}
                allPlayers={players}
                onBack={handleBackFromPlayer}
                nbaSchedule={nbaSchedule}
                backLabel={
                  previousView === 'team-detail' && selectedTeam
                    ? `Back to ${selectedTeam.teamName}`
                    : previousView === 'teams' ? 'Back to Teams'
                    : previousView === 'dashboard' ? 'Back to Dashboard'
                    : previousView === 'streaming' ? 'Back to Streaming'
                    : previousView === 'h2h' ? 'Back to H2H'
                    : previousView === 'trade' ? 'Back to Trade'
                    : 'Back to Players'
                }
              />
            </motion.div>
          )}
          {view === 'teams' && (
            <motion.div
              key="teams"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
            >
              <TeamsView
                teams={teams}
                onPlayerSelect={handlePlayerSelect}
                onTeamSelect={handleTeamSelect}
              />
            </motion.div>
          )}
          {view === 'team-detail' && selectedTeam && (
            <motion.div
              key="team-detail"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
            >
              <TeamDetail
                team={selectedTeam}
                allPlayers={players}
                onBack={handleBackFromTeam}
                onPlayerSelect={handlePlayerSelect}
              />
            </motion.div>
          )}
          {view === 'trade' && (
            <motion.div
              key="trade"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
            >
              <TradeMachine
                players={players}
                teams={teams}
              />
            </motion.div>
          )}
          {view === 'streaming' && (
            <motion.div
              key="streaming"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
            >
              <StreamingPanel
                players={players}
                teams={teams}
                rosters={rosters}
                allNbaPlayers={allNbaPlayers}
                onPlayerSelect={handlePlayerSelect}
                nbaSchedule={nbaSchedule}
              />
            </motion.div>
          )}
          {view === 'h2h' && (
            <motion.div
              key="h2h"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
            >
              <HeadToHead
                teams={teams}
                players={players}
                onPlayerSelect={handlePlayerSelect}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

export default App;

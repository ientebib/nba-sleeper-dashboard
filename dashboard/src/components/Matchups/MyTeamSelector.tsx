import { Target, Check } from 'lucide-react';
import type { TeamAnalytics } from '../../types';

interface Props {
  teams: TeamAnalytics[];
  currentTeamId?: number | null;
  onSelect: (rosterId: number) => void;
  onCancel?: () => void;
}

export default function MyTeamSelector({
  teams,
  currentTeamId,
  onSelect,
  onCancel,
}: Props) {
  // Sort teams by record (wins desc)
  const sortedTeams = [...teams].sort((a, b) => b.wins - a.wins);

  return (
    <div className="team-selector">
      <div className="selector-header">
        <Target size={24} />
        <h3>Select Your Team</h3>
      </div>
      <p className="selector-description">
        Choose which team is yours to track your lock-in decisions.
      </p>

      <div className="teams-grid">
        {sortedTeams.map(team => (
          <button
            key={team.rosterId}
            className={`team-option ${currentTeamId === team.rosterId ? 'selected' : ''}`}
            onClick={() => onSelect(team.rosterId)}
          >
            <div className="team-info">
              <span className="team-name">{team.teamName || team.ownerName}</span>
              <span className="owner-name">{team.ownerName}</span>
            </div>
            <div className="team-stats">
              <span className="record">{team.record}</span>
              <span className="lockin">Σ {team.totalExpectedLockin.toFixed(0)}</span>
            </div>
            {currentTeamId === team.rosterId && (
              <div className="selected-indicator">
                <Check size={16} />
              </div>
            )}
          </button>
        ))}
      </div>

      {onCancel && (
        <div className="selector-actions">
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

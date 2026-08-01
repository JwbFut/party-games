import type { TFunction } from 'i18next'
import Avatar from '../../../components/Avatar'
import type { PublicPlayer, PlayerProfile } from '../../../store/player'
import type { UIState } from '../WerewolfGame'

interface Props {
  players: PublicPlayer[]
  alivePlayers: PublicPlayer[]
  profile: PlayerProfile
  isHost: boolean
  ui: UIState
  t: TFunction
  phase: 'day' | 'night'
  onVote: (targetId: string) => void
}

export default function VotePhase({ alivePlayers, profile, ui, t, phase, onVote }: Props) {
  const isNight = phase === 'night'
  const canVote = ui.myRole !== null && (
    !isNight || ui.myRole === 'mafia'
  )
  const myPlayer = alivePlayers.find(p => p.id === profile.id)
  const isAlive = myPlayer !== undefined
  const canParticipate = canVote && isAlive && !ui.myVote

  const candidates = alivePlayers.filter(p => p.id !== profile.id)

  return (
    <div>
      {/* Phase banner */}
      <div className={`phase-banner ${isNight ? 'phase-night' : 'phase-day'}`}>
        {isNight ? '🌙' : '☀️'} {isNight ? t('werewolf.nightPhase') : t('werewolf.dayPhase')}
        {' — '}
        {t('werewolf.round', { n: ui.round })}
      </div>

      {/* Role reminder */}
      {ui.myRole && (
        <div style={{ textAlign: 'center', marginBottom: '0.75rem' }}>
          <span className={`badge ${ui.myRole === 'mafia' ? 'badge-mafia' : 'badge-town'}`}>
            {ui.myRole === 'mafia' ? t('werewolf.mafia') : t('werewolf.town')}
          </span>
          {ui.selectedWord && (
            <span style={{ marginLeft: '0.75rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {t('werewolf.theWordIs')}: <strong style={{ color: 'var(--accent)' }}>{ui.selectedWord}</strong>
            </span>
          )}
        </div>
      )}

      {/* Hint */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
          {isNight ? t('werewolf.nightVoteHint') : t('werewolf.dayVoteHint')}
        </p>
        {ui.myVote && (
          <p style={{ textAlign: 'center', color: 'var(--success)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
            ✓ {t('werewolf.waitingForVotes')}
          </p>
        )}
        {!canParticipate && !ui.myVote && isAlive && (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
            {isNight ? t('werewolf.waitingForMafia') : t('werewolf.waitingForVotes')}
          </p>
        )}
      </div>

      {/* Vote grid */}
      {canParticipate && (
        <div className="vote-grid">
          {candidates.map(p => (
            <button
              key={p.id}
              className={`vote-btn ${ui.myVote === p.id ? 'selected' : ''}`}
              onClick={() => onVote(p.id)}
            >
              <Avatar src={p.avatar} name={p.nickname} size={28} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.nickname}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Player list (spectator view) */}
      {(!canParticipate || !isAlive) && (
        <div className="card">
          <div className="section-title">{t('room.players')}</div>
          {alivePlayers.map(p => (
            <div key={p.id} className="player-row">
              <Avatar src={p.avatar} name={p.nickname} size={32} />
              <div className="player-info">
                <div className="player-name">{p.nickname}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isAlive && (
        <div style={{ textAlign: 'center', padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          {t('werewolf.youWereEliminated')}
        </div>
      )}
    </div>
  )
}

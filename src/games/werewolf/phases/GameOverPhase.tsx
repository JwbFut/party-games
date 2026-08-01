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
  onPlayAgain?: () => void
}

export default function GameOverPhase({ players, alivePlayers, ui, t, onPlayAgain }: Props) {
  const townWin = ui.winner === 'town'

  return (
    <div className="card">
      <div className="game-over">
        <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>
          {townWin ? '🎉' : '🐺'}
        </div>
        <h2 className={townWin ? 'winner-town' : 'winner-mafia'}>
          {townWin ? t('werewolf.townWins') : t('werewolf.mafiaWins')}
        </h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
          {t('werewolf.gameOver')}
        </p>

        {/* Reveal all roles */}
        <div style={{ textAlign: 'left', marginBottom: '1.5rem' }}>
          <div className="section-title">{t('room.players')}</div>
          {players.map(p => {
            const role = ui.mafiaMembers.includes(p.id) ? 'mafia' : 'town'
            const isAlive = alivePlayers.some(ap => ap.id === p.id)
            return (
              <div key={p.id} className={`player-row ${isAlive ? '' : 'dead'}`}>
                <Avatar src={p.avatar} name={p.nickname} size={32} />
                <div className="player-info">
                  <div className="player-name">{p.nickname}</div>
                </div>
                <span className={`badge ${role === 'mafia' ? 'badge-mafia' : 'badge-town'}`}>
                  {role === 'mafia' ? t('werewolf.mafia') : t('werewolf.town')}
                </span>
                {!isAlive && <span className="badge badge-dead">{t('werewolf.dead')}</span>}
              </div>
            )
          })}
        </div>

        {onPlayAgain && (
          <button className="btn-primary" style={{ width: '100%' }} onClick={onPlayAgain}>
            {t('werewolf.playAgain')}
          </button>
        )}
      </div>
    </div>
  )
}

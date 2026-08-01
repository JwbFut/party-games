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
}

export default function ResultPhase({ players, ui, t }: Props) {
  const isDayResult = ui.phase === 'day_result'
  const targetId = isDayResult ? ui.eliminatedId : ui.killedId
  const target = players.find(p => p.id === targetId)

  return (
    <div className="card">
      <div className="phase-banner phase-result">
        {isDayResult ? `☀️ ${t('werewolf.voteResult')}` : `🌙 ${t('werewolf.killResult')}`}
        {' — '}
        {t('werewolf.round', { n: ui.round })}
      </div>

      <div className="result-text">
        {target ? (
          <>
            <Avatar src={target.avatar} name={target.nickname} size={56} />
            <span className="highlight" style={{ marginTop: '0.5rem' }}>
              {target.nickname}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {isDayResult ? t('werewolf.eliminated') : t('werewolf.killed')}
            </span>
          </>
        ) : (
          <span style={{ color: 'var(--text-secondary)' }}>
            {t('werewolf.noElimination')}
          </span>
        )}

        {ui.lastTie && !isDayResult && ui.lastRandom && (
          <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--warning)' }}>
            {t('werewolf.randomTarget')}
          </div>
        )}
        {ui.lastTie && isDayResult && (
          <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--warning)' }}>
            {t('werewolf.noElimination')}
          </div>
        )}
      </div>
    </div>
  )
}

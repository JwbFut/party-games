import { useState } from 'react'
import type { TFunction } from 'i18next'
import Avatar from '../../../components/Avatar'
import type { PublicPlayer, PlayerProfile } from '../../../store/player'
import type { WerewolfConfig } from '../types'
import type { UIState } from '../WerewolfGame'

interface Props {
  players: PublicPlayer[]
  alivePlayers: PublicPlayer[]
  profile: PlayerProfile
  isHost: boolean
  ui: UIState
  t: TFunction
  locked: boolean
  onStart: (config: WerewolfConfig) => void
  onStop: () => void
}

export default function LobbyPhase({ players, profile, isHost, t, locked, onStart, onStop }: Props) {
  const [town, setTown] = useState(3)
  const [mafia, setMafia] = useState(1)
  const total = town + mafia
  const canStart = players.length === total && total >= 3 && mafia >= 1 && town >= 1

  return (
    <div>
      {/* Player list */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="section-title">
          {t('room.players')} ({players.length}{total > 0 ? `/${total}` : ''})
        </div>
        {players.map(p => (
          <div key={p.id} className="player-row">
            <Avatar src={p.avatar} name={p.nickname} size={36} />
            <div className="player-info">
              <div className="player-name">
                {p.nickname}
                {p.id === profile.id && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> ({t('room.you')})</span>}
              </div>
            </div>
            {p.id === players[0]?.id && <span className="badge badge-host">{t('room.host')}</span>}
          </div>
        ))}
        {players.length === 0 && (
          <div className="empty-state">{t('room.waitingForPlayers')}</div>
        )}
      </div>

      {/* Host controls */}
      {isHost && !locked && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="section-title">{t('werewolf.configureRoles')}</div>
          <div className="config-row">
            <label>{t('werewolf.townCount')}</label>
            <input
              type="number" min={1} max={20} value={town}
              onChange={e => setTown(Math.max(1, parseInt(e.target.value) || 1))}
            />
          </div>
          <div className="config-row">
            <label>{t('werewolf.mafiaCount')}</label>
            <input
              type="number" min={1} max={10} value={mafia}
              onChange={e => setMafia(Math.max(1, parseInt(e.target.value) || 1))}
            />
          </div>
          <div style={{ fontSize: '0.8rem', color: canStart ? 'var(--success)' : 'var(--text-muted)', marginBottom: '0.75rem' }}>
            {t('werewolf.needPlayers', { count: total, current: players.length })}
          </div>
          <button className="btn-primary" style={{ width: '100%' }} disabled={!canStart} onClick={() => onStart({ town, mafia })}>
            {t('room.start')}
          </button>
        </div>
      )}

      {isHost && locked && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--warning)', fontSize: '0.9rem' }}>{t('room.gameInProgress')}</span>
            <button className="btn-danger btn-sm" onClick={onStop}>{t('room.stop')}</button>
          </div>
        </div>
      )}

      {!isHost && (
        <div className="card">
          <div className="empty-state" style={{ padding: '1rem' }}>
            {locked ? t('room.gameInProgress') : t('room.waitingForPlayers')}
          </div>
        </div>
      )}
    </div>
  )
}

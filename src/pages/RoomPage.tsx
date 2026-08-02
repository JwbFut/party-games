import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate } from 'react-router'
import Seo from '../components/Seo'
import { Room } from '../lib/room'
import { loadProfile, type PublicPlayer } from '../store/player'
import type { RoomMessage } from '../lib/protocol'
import WerewolfGame from '../games/werewolf/WerewolfGame'

type ConnState = 'connecting' | 'connected' | 'rejected' | 'hostLost' | 'error'

interface Props {
  code: string
  isHost: boolean
}

export default function RoomPage({ code, isHost }: Props) {
  const { t } = useTranslation()
  const { lang } = useParams<{ lang: string }>()
  const navigate = useNavigate()

  const [profile] = useState(loadProfile)
  const roomRef = useRef<Room | null>(null)
  const [connState, setConnState] = useState<ConnState>('connecting')
  const [rejectReason, setRejectReason] = useState('')
  const [errorDetail, setErrorDetail] = useState('')
  const [players, setPlayers] = useState<PublicPlayer[]>([])
  const [locked, setLocked] = useState(false)
  const [toast, setToast] = useState('')
  const [msgLog, setMsgLog] = useState<RoomMessage[]>([])

  useEffect(() => {
    if (!profile || !code) {
      navigate(`/${lang}`)
      return
    }

    let room: Room
    try {
      room = new Room(code.toUpperCase(), profile, isHost)
    } catch (e) {
      setErrorDetail(String(e))
      setConnState('error')
      return
    }
    roomRef.current = room

    const unsubs = [
      room.on('players', p => setPlayers([...p])),
      room.on('locked', l => setLocked(l)),
      room.on('joined', () => setConnState('connected')),
      room.on('rejected', reason => {
        setRejectReason(reason)
        setConnState('rejected')
      }),
      room.on('hostLost', () => setConnState('hostLost')),
      room.on('error', reason => {
        setRejectReason(reason)
        setConnState('rejected')
      }),
      room.on('message', msg => setMsgLog(prev => [...prev.slice(-50), msg])),
    ]

    if (isHost) setConnState('connected')

    room.connect().catch((e) => {
      setErrorDetail(`connect: ${e}`)
      setConnState('error')
    })

    const timeout = isHost ? undefined : setTimeout(() => {
      setConnState(prev => prev === 'connecting' ? 'error' : prev)
    }, 45_000)

    return () => {
      if (timeout) clearTimeout(timeout)
      unsubs.forEach(u => u())
      room.destroy()
      roomRef.current = null
    }
  }, [code, isHost, profile, lang, navigate])

  const copyLink = useCallback(() => {
    const url = `${window.location.origin}/${lang}/?room=${code}`
    navigator.clipboard.writeText(url).then(() => {
      setToast(t('room.linkCopied'))
      setTimeout(() => setToast(''), 2000)
    })
  }, [lang, code, t])

  const leave = useCallback(() => {
    roomRef.current?.leave()
    navigate(`/${lang}`)
  }, [lang, navigate])

  if (!profile) return null

  if (connState === 'connecting') {
    return (
      <div className="container">
        <div className="empty-state">{t('room.connecting')}</div>
      </div>
    )
  }

  if (connState === 'error') {
    return (
      <div className="container">
        <div className="empty-state">
          {t('room.connectionFailed')}
          {errorDetail && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>{errorDetail}</div>}
        </div>
        <button className="btn-ghost" style={{ display: 'block', margin: '1rem auto' }} onClick={() => navigate(`/${lang}`)}>
          {t('nav.home')}
        </button>
      </div>
    )
  }

  if (connState === 'rejected') {
    const reasonText = rejectReason === 'game_started' ? t('room.gameInProgress')
      : rejectReason === 'already_in_room' ? t('room.alreadyInRoom')
      : rejectReason === 'room_taken' ? t('room.roomTaken')
      : rejectReason
    return (
      <div className="container">
        <div className="empty-state">{reasonText}</div>
        <button className="btn-ghost" style={{ display: 'block', margin: '1rem auto' }} onClick={() => navigate(`/${lang}`)}>
          {t('nav.home')}
        </button>
      </div>
    )
  }

  if (connState === 'hostLost') {
    return (
      <div className="container">
        <div className="empty-state">{t('room.hostDisconnected')}</div>
        <button className="btn-ghost" style={{ display: 'block', margin: '1rem auto' }} onClick={() => navigate(`/${lang}`)}>
          {t('nav.home')}
        </button>
      </div>
    )
  }

  const room = roomRef.current!

  return (
    <div className="container">
      <Seo titleKey="seo.werewolfTitle" descKey="seo.werewolfDescription" />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div>
          <div className="section-title" style={{ marginBottom: '0.25rem' }}>{t('home.roomCode')}</div>
          <div className="room-code-display" style={{ margin: 0, fontSize: '1.4rem', padding: '0.4rem 1rem' }}>
            {code.toUpperCase()}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn-ghost btn-sm" onClick={copyLink}>{t('room.copyLink')}</button>
          <button className="btn-danger btn-sm" onClick={leave}>{t('room.leave')}</button>
        </div>
      </div>

      <WerewolfGame
        room={room}
        profile={profile}
        players={players}
        locked={locked}
        isHost={isHost}
        msgLog={msgLog}
      />

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

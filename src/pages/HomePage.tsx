import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, Link } from 'react-router'
import Seo from '../components/Seo'
import Avatar from '../components/Avatar'
import ProfileSetup from '../pages/ProfileSetup'
import { loadProfile, type PlayerProfile } from '../store/player'

export default function HomePage() {
  const { t } = useTranslation()
  const { lang } = useParams<{ lang: string }>()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<PlayerProfile | null>(loadProfile)
  const [showSetup, setShowSetup] = useState(false)
  const [joinCode, setJoinCode] = useState('')

  const handleProfileSaved = useCallback((p: PlayerProfile) => {
    setProfile(p)
    setShowSetup(false)
  }, [])

  const joinRoom = () => {
    if (!profile) { setShowSetup(true); return }
    const code = joinCode.trim().toUpperCase()
    if (code.length < 4) return
    navigate(`/${lang}/?room=${code}`)
  }

  return (
    <div className="container">
      <Seo />
      <h1 style={{ fontSize: '1.6rem', marginBottom: '0.25rem' }}>{t('home.title')}</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>{t('home.subtitle')}</p>

      {/* Profile */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="section-title">{t('home.yourProfile')}</div>
        {profile ? (
          <div className="profile-card">
            <Avatar src={profile.avatar} name={profile.nickname} size={48} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{profile.nickname}</div>
            </div>
            <button className="btn-ghost btn-sm" onClick={() => setShowSetup(true)}>
              {t('home.editProfile')}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t('home.noProfile')}</span>
            <button className="btn-primary btn-sm" onClick={() => setShowSetup(true)}>
              {t('profile.setupTitle')}
            </button>
          </div>
        )}
      </div>

      {/* Join Room */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="section-title">{t('home.joinRoom')}</div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            placeholder={t('home.enterCode')}
            maxLength={6}
            onKeyDown={e => e.key === 'Enter' && joinRoom()}
            style={{ textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: "'Courier New', monospace", fontWeight: 700 }}
          />
          <button className="btn-primary" onClick={joinRoom} disabled={joinCode.trim().length < 4}>
            {t('home.join')}
          </button>
        </div>
      </div>

      {/* Games */}
      <div className="card">
        <div className="section-title">{t('home.games')}</div>
        <Link to={`/${lang}/games/werewolf`} className="player-row" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div style={{ fontSize: '1.5rem' }}>🐺</div>
          <div className="player-info">
            <div className="player-name">{t('home.werewolf')}</div>
            <div className="player-meta">{t('home.werewolfDesc')}</div>
          </div>
          <span style={{ color: 'var(--text-muted)' }}>→</span>
        </Link>
      </div>

      {showSetup && (
        <ProfileSetup
          existing={profile}
          onSaved={handleProfileSaved}
          onClose={() => setShowSetup(false)}
        />
      )}
    </div>
  )
}

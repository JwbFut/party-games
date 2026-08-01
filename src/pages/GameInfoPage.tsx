import { useTranslation } from 'react-i18next'
import { useParams, useNavigate, Link } from 'react-router'
import Seo from '../components/Seo'
import { generateRoomCode } from '../lib/protocol'

interface Props {
  game: 'werewolf'
}

export default function GameInfoPage({ game }: Props) {
  const { t } = useTranslation()
  const { lang } = useParams<{ lang: string }>()
  const navigate = useNavigate()

  const play = () => {
    const code = generateRoomCode()
    navigate(`/${lang}/?room=${code}&host=1&game=${game}`)
  }

  const steps: string[] = t('gameInfo.werewolf.steps', { returnObjects: true }) as string[]
  const ruleList: string[] = t('gameInfo.werewolf.ruleList', { returnObjects: true }) as string[]

  return (
    <div className="container">
      <Seo titleKey="seo.werewolfTitle" descKey="seo.werewolfDescription" />

      <Link to={`/${lang}`} style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        ← {t('nav.home')}
      </Link>

      <div style={{ textAlign: 'center', margin: '2rem 0 1.5rem' }}>
        <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🐺</div>
        <h1 style={{ fontSize: '1.8rem', marginBottom: '0.35rem' }}>{t('home.werewolf')}</h1>
        <p style={{ color: 'var(--text-secondary)' }}>{t('gameInfo.werewolf.tagline')}</p>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          {t('gameInfo.werewolf.about')}
        </p>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h2 className="section-title">{t('gameInfo.werewolf.howToPlay')}</h2>
        <ol style={{ paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {steps.map((step, i) => (
            <li key={i} style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
              {step}
            </li>
          ))}
        </ol>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 className="section-title">{t('gameInfo.werewolf.rules')}</h2>
        <ul style={{ paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {ruleList.map((rule, i) => (
            <li key={i} style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
              {rule}
            </li>
          ))}
        </ul>
      </div>

      <button className="btn-primary" style={{ width: '100%', padding: '0.9rem', fontSize: '1rem' }} onClick={play}>
        🐺 {t('gameInfo.werewolf.playNow')}
      </button>
    </div>
  )
}

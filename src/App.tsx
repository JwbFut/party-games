import { useEffect } from 'react'
import { Routes, Route, Navigate, useParams, Outlet, Link, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { isLang, DEFAULT_LANG, type Lang } from './i18n'
import LanguageSwitcher from './components/LanguageSwitcher'
import HomePage from './pages/HomePage'
import RoomPage from './pages/RoomPage'
import GameInfoPage from './pages/GameInfoPage'

function RootRedirect() {
  const browserLang = navigator.language.slice(0, 2)
  const lang: Lang = isLang(browserLang) ? browserLang : DEFAULT_LANG
  return <Navigate to={`/${lang}`} replace />
}

function IndexRouter() {
  const [searchParams] = useSearchParams()
  const room = searchParams.get('room')
  if (room) return <RoomPage code={room.toUpperCase()} isHost={searchParams.get('host') === '1'} />
  return <HomePage />
}

function Layout() {
  const { lang } = useParams<{ lang: string }>()
  const { i18n } = useTranslation()

  useEffect(() => {
    if (lang && isLang(lang) && i18n.language !== lang) {
      i18n.changeLanguage(lang)
    }
  }, [lang, i18n])

  if (!lang || !isLang(lang)) {
    return <Navigate to={`/${DEFAULT_LANG}`} replace />
  }

  return (
    <>
      <header className="header">
        <Link to={`/${lang}`} className="header-logo">
          🎲 <span>{i18n.t('app.name')}</span>
        </Link>
        <div className="header-actions">
          <LanguageSwitcher />
        </div>
      </header>
      <main style={{ flex: 1 }}>
        <Outlet />
      </main>
    </>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/:lang" element={<Layout />}>
        <Route index element={<IndexRouter />} />
        <Route path="games/werewolf" element={<GameInfoPage game="werewolf" />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

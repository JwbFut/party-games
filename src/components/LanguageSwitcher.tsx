import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { SUPPORTED_LANGS, type Lang } from '../i18n'

export default function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const { lang } = useParams<{ lang: string }>()
  const navigate = useNavigate()

  const switchLang = (l: Lang) => {
    if (l === lang) return
    const current = window.location.pathname
    const newPath = current.replace(`/${lang}`, `/${l}`)
    navigate(newPath)
  }

  return (
    <div className="lang-switcher" role="group" aria-label="Language">
      {SUPPORTED_LANGS.map(l => (
        <button
          key={l}
          className={l === (lang ?? i18n.language) ? 'active' : ''}
          onClick={() => switchLang(l)}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

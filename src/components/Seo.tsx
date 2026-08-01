import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import type { Lang } from '../i18n'

interface SeoProps {
  titleKey?: string
  descKey?: string
}

export default function Seo({ titleKey = 'seo.title', descKey = 'seo.description' }: SeoProps) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as Lang
  const title = t(titleKey)
  const desc = t(descKey)
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  const path = typeof window !== 'undefined' ? window.location.pathname : `/${lang}`
  const otherLang: Lang = lang === 'en' ? 'zh' : 'en'
  const otherPath = path.replace(`/${lang}`, `/${otherLang}`)

  return (
    <Helmet>
      <html lang={lang} />
      <title>{title}</title>
      <meta name="description" content={desc} />
      <link rel="canonical" href={`${base}${path}`} />
      <link rel="alternate" hrefLang="en" href={`${base}${lang === 'en' ? path : otherPath}`} />
      <link rel="alternate" hrefLang="zh" href={`${base}${lang === 'zh' ? path : otherPath}`} />
      <link rel="alternate" hrefLang="x-default" href={`${base}/en${path.replace(`/${lang}`, '')}`} />
      <meta property="og:type" content="website" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={desc} />
      <meta property="og:url" content={`${base}${path}`} />
      <meta property="og:locale" content={lang === 'zh' ? 'zh_CN' : 'en_US'} />
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={desc} />
    </Helmet>
  )
}

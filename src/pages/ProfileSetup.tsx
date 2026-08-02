import { useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import Avatar from '../components/Avatar'
import {
  createProfile, updateProfile, compressAvatar,
  MAX_NICKNAME_LEN, MAX_AVATAR_BYTES, type PlayerProfile,
} from '../store/player'

interface Props {
  existing: PlayerProfile | null
  onSaved: (p: PlayerProfile) => void
  onClose: () => void
}

export default function ProfileSetup({ existing, onSaved, onClose }: Props) {
  const { t } = useTranslation()
  const [nickname, setNickname] = useState(existing?.nickname ?? '')
  const [avatar, setAvatar] = useState<string | null>(existing?.avatar ?? null)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const isEdit = !!existing

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    if (file.size > 5 * 1024 * 1024) {
      setError(t('profile.avatarTooLarge', { max: Math.round(MAX_AVATAR_BYTES / 1024) }))
      return
    }
    try {
      const dataUrl = await compressAvatar(file)
      if (dataUrl.length > MAX_AVATAR_BYTES * 1.37) {
        setError(t('profile.avatarTooLarge', { max: Math.round(MAX_AVATAR_BYTES / 1024) }))
        return
      }
      setAvatar(dataUrl)
    } catch {
      setError(t('profile.avatarTooLarge', { max: Math.round(MAX_AVATAR_BYTES / 1024) }))
    }
  }, [t])

  const handleSave = () => {
    const name = nickname.trim()
    if (!name) {
      setError(t('profile.nicknameRequired'))
      return
    }
    if (name.length > MAX_NICKNAME_LEN) {
      setError(t('profile.nicknameTooLong', { max: MAX_NICKNAME_LEN }))
      return
    }
    const profile = isEdit
      ? updateProfile({ nickname: name, avatar })!
      : createProfile(name, avatar)
    onSaved(profile)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{isEdit ? t('profile.editTitle') : t('profile.setupTitle')}</h2>
        {!isEdit && <p>{t('profile.setupDesc')}</p>}

        <div className="privacy-notice">
          <span className="notice-icon" aria-hidden="true">⚠️</span>
          <span>{t('profile.privacyNotice')}</span>
        </div>

        <div className="profile-form">
          <div className="avatar-picker">
            <div className="avatar-preview" onClick={() => fileRef.current?.click()}>
              {avatar ? (
                <img src={avatar} alt="avatar" />
              ) : (
                <Avatar src={null} name={nickname || '?'} size={76} />
              )}
            </div>
            <div>
              <button className="btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>
                {t('profile.changeAvatar')}
              </button>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                ≤ {Math.round(MAX_AVATAR_BYTES / 1024)}KB
              </div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFile}
            />
          </div>

          <div className="form-group">
            <label>{t('profile.nickname')}</label>
            <input
              value={nickname}
              onChange={e => { setNickname(e.target.value); setError('') }}
              placeholder={t('profile.nicknamePlaceholder')}
              maxLength={MAX_NICKNAME_LEN + 4}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'right' }}>
              {nickname.length}/{MAX_NICKNAME_LEN}
            </div>
          </div>

          {error && <div className="form-error">{error}</div>}

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button className="btn-ghost" onClick={onClose}>{t('profile.cancel')}</button>
            <button className="btn-primary" onClick={handleSave}>{t('profile.save')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

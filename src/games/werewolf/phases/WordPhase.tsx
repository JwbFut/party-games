import { useState } from 'react'
import type { TFunction } from 'i18next'
import type { PublicPlayer, PlayerProfile } from '../../../store/player'
import type { UIState } from '../WerewolfGame'

interface Props {
  players: PublicPlayer[]
  alivePlayers: PublicPlayer[]
  profile: PlayerProfile
  isHost: boolean
  ui: UIState
  t: TFunction
  onSubmitWord: (word: string) => void
}

export default function WordPhase({ ui, t, onSubmitWord }: Props) {
  const [word, setWord] = useState('')

  if (ui.phase === 'word_reveal') {
    return (
      <div className="card">
        <div className="phase-banner phase-result">
          {t('werewolf.wordRevealed')}
        </div>
        <div className="result-text">
          <span style={{ color: 'var(--text-secondary)' }}>{t('werewolf.theWordIs')}</span>
          <span className="highlight" style={{ color: 'var(--accent)', fontSize: '2rem' }}>
            {ui.selectedWord}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Role badge — hidden during word_collect */}
      {ui.myRole && ui.phase !== 'word_collect' && (
        <div className="card" style={{ marginBottom: '1rem', textAlign: 'center' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('werewolf.yourRole')}: </span>
          <span className={`badge ${ui.myRole === 'mafia' ? 'badge-mafia' : 'badge-town'}`}>
            {ui.myRole === 'mafia' ? t('werewolf.mafia') : t('werewolf.town')}
          </span>
          {ui.myRole === 'mafia' && ui.mafiaMembers.length > 1 && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {t('werewolf.mafiaMembers')}: {ui.mafiaMembers.length}
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="phase-banner phase-day" style={{ marginBottom: '1rem' }}>
          {t('werewolf.wordCollection')} — {t('werewolf.round', { n: ui.round })}
        </div>

        {ui.wordSubmitted ? (
          <div className="result-text">
            <span style={{ color: 'var(--success)' }}>✓ {t('werewolf.wordSubmitted')}</span>
            <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {t('werewolf.wordsCollected', { count: ui.wordsCollected, total: ui.totalWords })}
            </div>
          </div>
        ) : (
          <div>
            <div className="word-input-area">
              <input
                value={word}
                onChange={e => setWord(e.target.value)}
                placeholder={t('werewolf.wordPlaceholder')}
                maxLength={30}
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter' && word.trim()) onSubmitWord(word.trim())
                }}
              />
              <button
                className="btn-primary"
                disabled={!word.trim()}
                onClick={() => onSubmitWord(word.trim())}
              >
                {t('werewolf.submitWord')}
              </button>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {t('werewolf.wordsCollected', { count: ui.wordsCollected, total: ui.totalWords })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

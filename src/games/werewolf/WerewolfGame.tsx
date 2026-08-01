import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { Room } from '../../lib/room'
import type { PlayerProfile, PublicPlayer } from '../../store/player'
import type {
  RoomMessage, WordSubmitPayload, VotePayload, WordRevealPayload,
  VoteResultPayload, KillResultPayload, GameEndPayload, RoleAssignPayload,
  PhaseChangePayload,
} from '../../lib/protocol'
import type { GamePhase, Role, WerewolfState, WerewolfConfig } from './types'
import * as logic from './logic'
import LobbyPhase from './phases/LobbyPhase'
import WordPhase from './phases/WordPhase'
import VotePhase from './phases/VotePhase'
import ResultPhase from './phases/ResultPhase'
import GameOverPhase from './phases/GameOverPhase'

interface Props {
  room: Room
  profile: PlayerProfile
  players: PublicPlayer[]
  locked: boolean
  isHost: boolean
  msgLog: RoomMessage[]
}

export interface UIState {
  phase: GamePhase
  round: number
  myRole: Role | null
  mafiaMembers: string[]
  selectedWord: string | null
  eliminatedId: string | null
  killedId: string | null
  deadIds: string[]
  lastTie: boolean
  lastRandom: boolean
  winner: Role | null
  wordsCollected: number
  totalWords: number
  votesCollected: number
  totalVotes: number
  config: WerewolfConfig
  myWord: string
  myVote: string
  wordSubmitted: boolean
}

const initialUI: UIState = {
  phase: 'lobby',
  round: 0,
  myRole: null,
  mafiaMembers: [],
  selectedWord: null,
  eliminatedId: null,
  killedId: null,
  deadIds: [],
  lastTie: false,
  lastRandom: false,
  winner: null,
  wordsCollected: 0,
  totalWords: 0,
  votesCollected: 0,
  totalVotes: 0,
  config: { town: 0, mafia: 0 },
  myWord: '',
  myVote: '',
  wordSubmitted: false,
}

export default function WerewolfGame({ room, profile, players, locked, isHost }: Props) {
  const { t } = useTranslation()
  const [ui, setUI] = useState<UIState>(initialUI)
  const stateRef = useRef<WerewolfState>(logic.createInitialState({ town: 0, mafia: 0 }))

  const patch = useCallback((p: Partial<UIState> | ((prev: UIState) => Partial<UIState>)) => {
    setUI(prev => ({ ...prev, ...(typeof p === 'function' ? p(prev) : p) }))
  }, [])

  /* ── Host: process incoming player actions ── */
  useEffect(() => {
    if (!isHost) return
    const unsubs = [
      room.on('message', (msg: RoomMessage) => {
        const s = stateRef.current

        switch (msg.type) {
          case 'WORD_SUBMIT': {
            if (s.phase !== 'word_collect') return
            const { word } = msg.payload as WordSubmitPayload
            stateRef.current = logic.submitWord(s, msg.senderId, word)
            const snap = logic.toSnapshot(stateRef.current)
            patch({ wordsCollected: snap.wordsCollected, totalWords: snap.totalWords })
            if (logic.allWordsCollected(stateRef.current)) {
              stateRef.current = logic.revealWord(stateRef.current)
              const word = stateRef.current.selectedWord!
              room.sendMsg('WORD_REVEAL', { word } satisfies WordRevealPayload)
              advanceToDay()
            }
            break
          }
          case 'VOTE': {
            if (s.phase !== 'day') return
            const { targetId } = msg.payload as VotePayload
            console.log('[WW] host recv VOTE from', msg.senderId.slice(0, 8), '→', targetId.slice(0, 8), 'phase=', s.phase)
            stateRef.current = logic.castVote(s, msg.senderId, targetId)
            const snap = logic.toSnapshot(stateRef.current)
            console.log('[WW] votes:', snap.votesCollected, '/', snap.totalVotes)
            patch({ votesCollected: snap.votesCollected, totalVotes: snap.totalVotes })
            if (logic.allVotesCollected(stateRef.current)) {
              console.log('[WW] all votes collected, tallying')
              stateRef.current = logic.tallyDayVotes(stateRef.current)
              broadcastDayResult()
            }
            break
          }
          case 'KILL_VOTE': {
            console.log('[WW] host recv KILL_VOTE from', msg.senderId, 'phase=', s.phase, 'role=', s.roles[msg.senderId], 'roles keys=', Object.keys(s.roles).join(','))
            if (s.phase !== 'night') return
            const { targetId } = msg.payload as VotePayload
            stateRef.current = logic.castKillVote(s, msg.senderId, targetId)
            const aliveMafia = stateRef.current.players.filter(p => p.alive && stateRef.current.roles[p.id] === 'mafia')
            const votedMafia = aliveMafia.filter(p => stateRef.current.votes[p.id])
            console.log('[WW] kill votes:', votedMafia.length, '/', aliveMafia.length)
            if (logic.allKillVotesCollected(stateRef.current)) {
              console.log('[WW] all kill votes collected, tallying')
              stateRef.current = logic.tallyKillVotes(stateRef.current)
              broadcastNightResult()
            }
            break
          }
          default:
            break
        }
      }),
    ]
    return () => unsubs.forEach(u => u())
  }, [isHost, room, profile.id, patch]) // stable callbacks omitted intentionally

  /* ── Player: process host broadcasts ── */
  useEffect(() => {
    if (isHost) return
    const unsubs = [
      room.on('message', (msg: RoomMessage) => {
        switch (msg.type) {
          case 'ROLE_ASSIGN': {
            const { targetId, role, mafiaMembers } = msg.payload as RoleAssignPayload
            if (targetId !== profile.id) break
            patch({ myRole: role, mafiaMembers })
            break
          }
          case 'PHASE_CHANGE': {
            const { phase, round } = msg.payload as PhaseChangePayload
            patch({
              phase: phase as GamePhase,
              round,
              myVote: '',
              ...(phase === 'word_collect' ? { wordSubmitted: false, myWord: '', selectedWord: null } : {}),
              ...(phase === 'day' ? { eliminatedId: null, lastTie: false } : {}),
              ...(phase === 'night' ? { killedId: null, lastRandom: false } : {}),
            })
            break
          }
          case 'WORD_REVEAL': {
            const { word } = msg.payload as WordRevealPayload
            patch({ selectedWord: word, phase: 'word_reveal' })
            break
          }
          case 'VOTE_RESULT': {
            const { eliminatedId, tie } = msg.payload as VoteResultPayload
            patch(prev => ({ eliminatedId, lastTie: tie, phase: 'day_result', deadIds: eliminatedId ? [...prev.deadIds, eliminatedId] : prev.deadIds }))
            break
          }
          case 'KILL_RESULT': {
            const { killedId, tie, random } = msg.payload as KillResultPayload
            patch(prev => ({ killedId, lastTie: tie, lastRandom: random, phase: 'night_result', deadIds: killedId ? [...prev.deadIds, killedId] : prev.deadIds }))
            break
          }
          case 'GAME_END': {
            const { winner } = msg.payload as GameEndPayload
            patch({ winner, phase: 'game_over' })
            break
          }
          case 'GAME_STOP': {
            resetGame()
            break
          }
          default:
            break
        }
      }),
    ]
    return () => unsubs.forEach(u => u())
  }, [isHost, room, profile.id, patch]) // stable callbacks omitted intentionally

  /* ── Host helpers ── */
  const advanceToDay = useCallback(() => {
    stateRef.current = logic.startDay(stateRef.current)
    const s = stateRef.current
    room.sendMsg('PHASE_CHANGE', { phase: 'day', round: s.round } satisfies PhaseChangePayload)
    patch({ phase: 'day', round: s.round, selectedWord: s.selectedWord, votesCollected: 0, totalVotes: s.players.filter(p => p.alive).length, myVote: '' })
  }, [room, patch])

  const broadcastDayResult = useCallback(() => {
    const s = stateRef.current
    room.sendMsg('VOTE_RESULT', {
      votes: s.votes,
      eliminatedId: s.eliminatedId,
      tie: s.lastTie,
    } satisfies VoteResultPayload)

    const winner = logic.checkWinner(s)
    if (winner) {
      stateRef.current = { ...s, winner, phase: 'game_over' }
      room.sendMsg('GAME_END', { winner } satisfies GameEndPayload)
      patch(prev => ({ phase: 'game_over', winner, eliminatedId: s.eliminatedId, lastTie: s.lastTie, deadIds: s.eliminatedId ? [...prev.deadIds, s.eliminatedId] : prev.deadIds }))
    } else {
      patch(prev => ({ phase: 'day_result', eliminatedId: s.eliminatedId, lastTie: s.lastTie, deadIds: s.eliminatedId ? [...prev.deadIds, s.eliminatedId] : prev.deadIds }))
      setTimeout(() => advanceToNight(), 3000)
    }
  }, [room, patch])

  const advanceToNight = useCallback(() => {
    const s = stateRef.current
    stateRef.current = logic.startNight(s)
    const aliveMafia = s.players.filter(p => p.alive && s.roles[p.id] === 'mafia')
    room.sendMsg('PHASE_CHANGE', { phase: 'night', round: s.round } satisfies PhaseChangePayload)
    patch({ phase: 'night', votesCollected: 0, totalVotes: aliveMafia.length, myVote: '' })
  }, [room, patch])

  const broadcastNightResult = useCallback(() => {
    const s = stateRef.current
    room.sendMsg('KILL_RESULT', {
      killedId: s.killedId,
      tie: s.lastTie,
      random: s.lastRandom,
    } satisfies KillResultPayload)

    const winner = logic.checkWinner(s)
    if (winner) {
      stateRef.current = { ...s, winner, phase: 'game_over' }
      room.sendMsg('GAME_END', { winner } satisfies GameEndPayload)
      patch(prev => ({ phase: 'game_over', winner, killedId: s.killedId, lastTie: s.lastTie, lastRandom: s.lastRandom, deadIds: s.killedId ? [...prev.deadIds, s.killedId] : prev.deadIds }))
    } else {
      patch(prev => ({ phase: 'night_result', killedId: s.killedId, lastTie: s.lastTie, lastRandom: s.lastRandom, deadIds: s.killedId ? [...prev.deadIds, s.killedId] : prev.deadIds }))
      setTimeout(() => advanceToNextDay(), 3000)
    }
  }, [room, patch])

  const advanceToNextDay = useCallback(() => {
    const s = stateRef.current
    stateRef.current = logic.startWordCollection(s)
    const snap = logic.toSnapshot(stateRef.current)
    room.sendMsg('PHASE_CHANGE', { phase: 'word_collect', round: s.round } satisfies PhaseChangePayload)
    patch({
      phase: 'word_collect', round: s.round, selectedWord: null,
      wordsCollected: 0, totalWords: snap.totalWords,
      eliminatedId: null, killedId: null, lastTie: false, lastRandom: false,
      myWord: '', myVote: '', wordSubmitted: false,
    })
  }, [room, patch])

  const resetGame = useCallback(() => {
    stateRef.current = logic.createInitialState(stateRef.current.config)
    setUI(prev => ({ ...initialUI, config: prev.config }))
    room.unlockRoom()
  }, [room])

  /* ── Actions ── */
  const startGame = useCallback((config: WerewolfConfig) => {
    const wp = logic.toWerewolfPlayers(players)
    const roles = logic.assignRoles(wp, config)
    const s = logic.createInitialState(config)
    s.players = wp
    s.roles = roles
    s.phase = 'word_collect'
    s.round = 1
    stateRef.current = s

    room.lockRoom()
    room.setConfig(config)

    const mafiaIds = logic.getMafiaMembers(s)
    for (const p of wp) {
      room.sendMsg('ROLE_ASSIGN', {
        targetId: p.id,
        role: roles[p.id],
        mafiaMembers: mafiaIds,
      } satisfies RoleAssignPayload)
    }

    room.sendMsg('PHASE_CHANGE', { phase: 'word_collect', round: 1 } satisfies PhaseChangePayload)

    const snap = logic.toSnapshot(s)
    patch({
      phase: 'word_collect', round: 1,
      myRole: roles[profile.id],
      mafiaMembers: mafiaIds,
      config,
      wordsCollected: 0,
      totalWords: snap.totalWords,
      wordSubmitted: false,
      myWord: '',
      myVote: '',
      selectedWord: null,
      winner: null,
    })
  }, [players, room, profile.id, patch])

  const submitWord = useCallback((word: string) => {
    if (isHost) {
      stateRef.current = logic.submitWord(stateRef.current, profile.id, word)
      const snap = logic.toSnapshot(stateRef.current)
      patch({ wordSubmitted: true, myWord: word, wordsCollected: snap.wordsCollected })
      if (logic.allWordsCollected(stateRef.current)) {
        stateRef.current = logic.revealWord(stateRef.current)
        const w = stateRef.current.selectedWord!
        room.sendMsg('WORD_REVEAL', { word: w } satisfies WordRevealPayload)
        advanceToDay()
      }
    } else {
      room.sendMsg('WORD_SUBMIT', { word } satisfies WordSubmitPayload)
      patch({ wordSubmitted: true, myWord: word })
    }
  }, [isHost, room, profile.id, patch, advanceToDay])

  const castVote = useCallback((targetId: string) => {
    if (isHost) {
      console.log('[WW] host castVote →', targetId.slice(0, 8), 'phase=', stateRef.current.phase)
      stateRef.current = logic.castVote(stateRef.current, profile.id, targetId)
      const snap = logic.toSnapshot(stateRef.current)
      console.log('[WW] votes after host vote:', snap.votesCollected, '/', snap.totalVotes)
      patch({ myVote: targetId, votesCollected: snap.votesCollected })
      if (logic.allVotesCollected(stateRef.current)) {
        console.log('[WW] all votes collected (host trigger), tallying')
        stateRef.current = logic.tallyDayVotes(stateRef.current)
        broadcastDayResult()
      }
    } else {
      console.log('[WW] player send VOTE →', targetId.slice(0, 8))
      room.sendMsg('VOTE', { targetId } satisfies VotePayload)
      patch({ myVote: targetId })
    }
  }, [isHost, room, profile.id, patch, broadcastDayResult])

  const castKillVote = useCallback((targetId: string) => {
    if (isHost) {
      stateRef.current = logic.castKillVote(stateRef.current, profile.id, targetId)
      patch({ myVote: targetId })
      if (logic.allKillVotesCollected(stateRef.current)) {
        stateRef.current = logic.tallyKillVotes(stateRef.current)
        broadcastNightResult()
      }
    } else {
      room.sendMsg('KILL_VOTE', { targetId } satisfies VotePayload)
      patch({ myVote: targetId })
    }
  }, [isHost, room, profile.id, patch, broadcastNightResult])

  const stopGame = useCallback(() => {
    room.sendMsg('GAME_STOP', {})
    resetGame()
  }, [room, resetGame])

  /* ── Render ── */
  const alivePlayers = players.filter(p => {
    if (ui.phase === 'lobby') return true
    if (isHost) {
      const wp = stateRef.current.players.find(wp => wp.id === p.id)
      return wp ? wp.alive : true
    }
    return !ui.deadIds.includes(p.id)
  })

  const commonProps = {
    players,
    alivePlayers,
    profile,
    isHost,
    ui,
    t,
  }

  switch (ui.phase) {
    case 'lobby':
      return (
        <LobbyPhase
          {...commonProps}
          onStart={startGame}
          onStop={stopGame}
          locked={locked}
        />
      )
    case 'word_collect':
    case 'word_reveal':
      return (
        <WordPhase
          {...commonProps}
          onSubmitWord={submitWord}
        />
      )
    case 'day':
      return (
        <VotePhase
          {...commonProps}
          phase="day"
          onVote={castVote}
        />
      )
    case 'night':
      return (
        <VotePhase
          {...commonProps}
          phase="night"
          onVote={castKillVote}
        />
      )
    case 'day_result':
    case 'night_result':
      return (
        <ResultPhase {...commonProps} />
      )
    case 'game_over':
      return (
        <GameOverPhase
          {...commonProps}
          onPlayAgain={isHost ? stopGame : undefined}
        />
      )
    default:
      return null
  }
}

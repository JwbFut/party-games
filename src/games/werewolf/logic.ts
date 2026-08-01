import type {
  WerewolfState, WerewolfPlayer, WerewolfConfig, Role, GamePhase, WerewolfSnapshot,
} from './types'
import type { PublicPlayer } from '../../store/player'

export function createInitialState(config: WerewolfConfig): WerewolfState {
  return {
    phase: 'lobby',
    round: 0,
    players: [],
    roles: {},
    words: {},
    selectedWord: null,
    votes: {},
    eliminatedId: null,
    killedId: null,
    lastTie: false,
    lastRandom: false,
    winner: null,
    config,
  }
}

export function assignRoles(players: WerewolfPlayer[], config: WerewolfConfig): Record<string, Role> {
  const ids = players.map(p => p.id)
  const shuffled = [...ids].sort(() => Math.random() - 0.5)
  const roles: Record<string, Role> = {}
  for (let i = 0; i < shuffled.length; i++) {
    roles[shuffled[i]] = i < config.mafia ? 'mafia' : 'town'
  }
  return roles
}

export function startWordCollection(state: WerewolfState): WerewolfState {
  return {
    ...state,
    phase: 'word_collect',
    round: state.round + 1,
    words: {},
    selectedWord: null,
    votes: {},
    eliminatedId: null,
    killedId: null,
    lastTie: false,
    lastRandom: false,
  }
}

export function submitWord(state: WerewolfState, playerId: string, word: string): WerewolfState {
  if (state.phase !== 'word_collect') return state
  if (state.words[playerId]) return state
  const player = state.players.find(p => p.id === playerId)
  if (!player || !player.alive) return state
  return { ...state, words: { ...state.words, [playerId]: word } }
}

export function allWordsCollected(state: WerewolfState): boolean {
  const alive = state.players.filter(p => p.alive)
  return alive.length > 0 && alive.every(p => state.words[p.id])
}

export function revealWord(state: WerewolfState): WerewolfState {
  const words = Object.values(state.words)
  const selected = words[Math.floor(Math.random() * words.length)]
  return { ...state, phase: 'word_reveal', selectedWord: selected }
}

export function startDay(state: WerewolfState): WerewolfState {
  return { ...state, phase: 'day', votes: {} }
}

export function castVote(state: WerewolfState, voterId: string, targetId: string): WerewolfState {
  if (state.phase !== 'day') return state
  const voter = state.players.find(p => p.id === voterId)
  const target = state.players.find(p => p.id === targetId)
  if (!voter?.alive || !target?.alive) return state
  if (state.votes[voterId]) return state
  return { ...state, votes: { ...state.votes, [voterId]: targetId } }
}

export function allVotesCollected(state: WerewolfState): boolean {
  const alive = state.players.filter(p => p.alive)
  return alive.length > 0 && alive.every(p => state.votes[p.id])
}

export function tallyDayVotes(state: WerewolfState): WerewolfState {
  const counts: Record<string, number> = {}
  for (const target of Object.values(state.votes)) {
    counts[target] = (counts[target] ?? 0) + 1
  }
  const max = Math.max(...Object.values(counts), 0)
  const topTargets = Object.entries(counts).filter(([, c]) => c === max).map(([id]) => id)

  if (topTargets.length <= 1 && max > 0) {
    const eliminatedId = topTargets[0]
    return {
      ...state,
      phase: 'day_result',
      eliminatedId,
      lastTie: false,
      players: state.players.map(p =>
        p.id === eliminatedId ? { ...p, alive: false } : p,
      ),
    }
  }
  return { ...state, phase: 'day_result', eliminatedId: null, lastTie: true }
}

export function startNight(state: WerewolfState): WerewolfState {
  return { ...state, phase: 'night', votes: {} }
}

export function castKillVote(state: WerewolfState, mafiaId: string, targetId: string): WerewolfState {
  if (state.phase !== 'night') return state
  if (state.roles[mafiaId] !== 'mafia') return state
  const mafia = state.players.find(p => p.id === mafiaId)
  const target = state.players.find(p => p.id === targetId)
  if (!mafia?.alive || !target?.alive) return state
  if (state.votes[mafiaId]) return state
  return { ...state, votes: { ...state.votes, [mafiaId]: targetId } }
}

export function allKillVotesCollected(state: WerewolfState): boolean {
  const aliveMafia = state.players.filter(p => p.alive && state.roles[p.id] === 'mafia')
  return aliveMafia.length > 0 && aliveMafia.every(p => state.votes[p.id])
}

export function tallyKillVotes(state: WerewolfState): WerewolfState {
  const counts: Record<string, number> = {}
  for (const target of Object.values(state.votes)) {
    counts[target] = (counts[target] ?? 0) + 1
  }
  const max = Math.max(...Object.values(counts), 0)
  const topTargets = Object.entries(counts).filter(([, c]) => c === max).map(([id]) => id)

  let killedId: string
  let isRandom = false
  if (topTargets.length === 1) {
    killedId = topTargets[0]
  } else {
    killedId = topTargets[Math.floor(Math.random() * topTargets.length)]
    isRandom = true
  }

  return {
    ...state,
    phase: 'night_result',
    killedId,
    lastTie: topTargets.length > 1,
    lastRandom: isRandom,
    players: state.players.map(p =>
      p.id === killedId ? { ...p, alive: false } : p,
    ),
  }
}

export function checkWinner(state: WerewolfState): Role | null {
  const alive = state.players.filter(p => p.alive)
  const aliveMafia = alive.filter(p => state.roles[p.id] === 'mafia')
  const aliveTown = alive.filter(p => state.roles[p.id] === 'town')

  if (aliveMafia.length === 0) return 'town'
  if (aliveMafia.length >= aliveTown.length) return 'mafia'
  return null
}

export function toSnapshot(state: WerewolfState): WerewolfSnapshot {
  const alive = state.players.filter(p => p.alive)
  const aliveMafia = alive.filter(p => state.roles[p.id] === 'mafia')
  return {
    phase: state.phase,
    round: state.round,
    players: state.players,
    selectedWord: state.selectedWord,
    eliminatedId: state.eliminatedId,
    killedId: state.killedId,
    lastTie: state.lastTie,
    lastRandom: state.lastRandom,
    winner: state.winner,
    config: state.config,
    wordsCollected: Object.keys(state.words).length,
    totalWords: alive.length,
    votesCollected: Object.keys(state.votes).length,
    totalVotes: state.phase === 'night' ? aliveMafia.length : alive.length,
  }
}

export function toWerewolfPlayers(players: PublicPlayer[]): WerewolfPlayer[] {
  return players.map(p => ({
    id: p.id,
    nickname: p.nickname,
    avatar: p.avatar,
    peerId: p.peerId,
    alive: true,
  }))
}

export function getMafiaMembers(state: WerewolfState): string[] {
  return Object.entries(state.roles)
    .filter(([, role]) => role === 'mafia')
    .map(([id]) => id)
}

export const PHASE_ORDER: GamePhase[] = [
  'lobby', 'word_collect', 'word_reveal', 'day', 'day_result', 'night', 'night_result', 'game_over',
]

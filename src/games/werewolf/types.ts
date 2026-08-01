export type Role = 'town' | 'mafia'

export type GamePhase =
  | 'lobby'
  | 'word_collect'
  | 'word_reveal'
  | 'day'
  | 'day_result'
  | 'night'
  | 'night_result'
  | 'game_over'

export interface WerewolfPlayer {
  id: string
  nickname: string
  avatar: string | null
  peerId: string
  alive: boolean
}

export interface WerewolfConfig {
  town: number
  mafia: number
}

export interface WerewolfState {
  phase: GamePhase
  round: number
  players: WerewolfPlayer[]
  roles: Record<string, Role>
  words: Record<string, string>
  selectedWord: string | null
  votes: Record<string, string>
  eliminatedId: string | null
  killedId: string | null
  lastTie: boolean
  lastRandom: boolean
  winner: Role | null
  config: WerewolfConfig
}

export interface WerewolfSnapshot {
  phase: GamePhase
  round: number
  players: WerewolfPlayer[]
  selectedWord: string | null
  eliminatedId: string | null
  killedId: string | null
  lastTie: boolean
  lastRandom: boolean
  winner: Role | null
  config: WerewolfConfig
  wordsCollected: number
  totalWords: number
  votesCollected: number
  totalVotes: number
}

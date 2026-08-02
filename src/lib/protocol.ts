import type { PublicPlayer } from '../store/player'

export type MessageType =
  | 'JOIN_REQUEST'
  | 'JOIN_ACCEPT'
  | 'JOIN_REJECT'
  | 'PLAYER_LIST'
  | 'PLAYER_LEAVE'
  | 'GAME_CONFIG'
  | 'GAME_START'
  | 'PHASE_CHANGE'
  | 'WORD_SUBMIT'
  | 'WORD_PROGRESS'
  | 'WORD_REVEAL'
  | 'VOTE'
  | 'VOTE_RESULT'
  | 'KILL_VOTE'
  | 'KILL_RESULT'
  | 'GAME_END'
  | 'GAME_STOP'
  | 'ROLE_ASSIGN'
  | 'HOST_LOST'

export interface RoomMessage<T = unknown> {
  type: MessageType
  senderId: string
  ts: number
  seq: number
  payload: T
}

export interface JoinRequestPayload {
  profile: PublicPlayer
}

export interface JoinRejectPayload {
  reason: string
}

export interface PlayerListPayload {
  players: PublicPlayer[]
  hostId: string
  locked: boolean
  config: GameConfigPayload
}

export interface GameConfigPayload {
  town: number
  mafia: number
}

export interface PhaseChangePayload {
  phase: string
  round: number
}

export interface WordSubmitPayload {
  word: string
}

export interface WordRevealPayload {
  words: string[]
}

export interface WordProgressPayload {
  count: number
  total: number
}

export interface VotePayload {
  targetId: string
}

export interface VoteResultPayload {
  votes: Record<string, string>
  eliminatedId: string | null
  tie: boolean
}

export interface KillResultPayload {
  killedId: string | null
  tie: boolean
  random: boolean
}

export interface GameEndPayload {
  winner: 'town' | 'mafia'
}

export interface RoleAssignPayload {
  targetId: string
  role: 'town' | 'mafia'
  mafiaMembers: string[]
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

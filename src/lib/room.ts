import { joinRoom, type Room as TrysteroRoom } from '@trystero-p2p/mqtt'
import type { PlayerProfile, PublicPlayer } from '../store/player'
import type { RoomMessage, GameConfigPayload, JoinRequestPayload } from './protocol'

const APP_ID = 'party-games-v1'
const dbg = (...args: unknown[]) => console.log('[Room]', ...args)

function getRelayUrls(): string[] {
  const fromUrl = new URLSearchParams(window.location.search).get('mqtt')
  if (fromUrl) {
    if (!fromUrl.includes('localhost') && !fromUrl.includes('127.0.0.1')) {
      localStorage.setItem('party-games:mqtt', fromUrl)
    }
    dbg(`relay (from URL param): ${fromUrl}`)
    return [fromUrl]
  }
  const stored = localStorage.getItem('party-games:mqtt')
  if (stored) {
    dbg(`relay (from localStorage): ${stored}`)
    return [stored]
  }
  const defaults = [
    'wss://broker-cn.emqx.io:8084/mqtt',
    'wss://broker.emqx.io:8084/mqtt',
  ]
  dbg(`relay: ${defaults.join(', ')}`)
  return defaults
}

type Listener<K extends keyof RoomEvents> = (data: RoomEvents[K]) => void
type SendFn = (data: Record<string, unknown>, opts?: { target?: string | string[] }) => Promise<void>

export interface RoomEvents {
  players: PublicPlayer[]
  phase: { phase: string; round: number }
  message: RoomMessage
  error: string
  hostLost: void
  joined: void
  rejected: string
  locked: boolean
}

export class Room {
  readonly code: string
  readonly profile: PlayerProfile
  isHost: boolean
  players: PublicPlayer[] = []
  hostId = ''
  locked = false
  config: GameConfigPayload = { town: 0, mafia: 0 }

  private trystero: TrysteroRoom
  private broadcastFn: SendFn
  private sendToFn: SendFn
  private peerMap = new Map<string, string>()
  private peerRev = new Map<string, string>()
  private listeners = new Map<string, Set<Listener<never>>>()
  private destroyed = false
  private joinedOnce = false
  private retryTimer: ReturnType<typeof setInterval> | null = null
  private lobbyTimer: ReturnType<typeof setInterval> | null = null
  private seenMsgs = new Set<string>()
  private lastListTs = 0

  constructor(code: string, profile: PlayerProfile, isHost: boolean) {
    this.code = code
    this.profile = profile
    this.isHost = isHost
    if (isHost) {
      this.hostId = profile.id
      this.players = [this.toPublic(profile)]
    }

    dbg(`init: code=${code} isHost=${isHost} id=${profile.id.slice(0, 8)}`)

    const relayUrls = getRelayUrls()
    this.trystero = joinRoom({
      appId: APP_ID,
      relayConfig: { urls: relayUrls },
      rtcConfig: {
        iceServers: [
          { urls: 'stun:stun.cloudflare.com:3478' },
          { urls: 'stun:stun.miwifi.com:3478' },
          { urls: 'stun:stun.chat.bilibili.com:3478' },
          {
            urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443'],
            username: 'openrelayproject',
            credential: 'openrelayproject',
          },
        ],
      },
    }, code)

    const msg = this.trystero.makeAction('msg')
    const priv = this.trystero.makeAction('priv')
    this.broadcastFn = msg.send as SendFn
    this.sendToFn = priv.send as SendFn

    msg.onMessage = (data, ctx) => {
      const m = data as unknown as RoomMessage
      dbg(`recv msg: type=${m.type} from=${ctx.peerId.slice(0, 8)} sender=${m.senderId?.slice(0, 8)}`)
      this.onMsg(m, ctx.peerId)
    }
    priv.onMessage = (data, ctx) => {
      const m = data as unknown as RoomMessage
      dbg(`recv priv: type=${m.type} from=${ctx.peerId.slice(0, 8)}`)
      this.onPrivate(m)
    }

    this.trystero.onPeerJoin = (peerId) => {
      const peers = this.trystero.getPeers()
      const pc = peers[peerId] as RTCPeerConnection | undefined
      dbg(`peer JOIN: ${peerId.slice(0, 8)} | peers=${Object.keys(peers).length} | ice=${pc?.iceConnectionState} conn=${pc?.connectionState}`)
      pc?.addEventListener('iceconnectionstatechange', () => {
        dbg(`ICE: ${pc.iceConnectionState} (peer ${peerId.slice(0, 8)})`)
      })
      if (this.isHost && !this.locked) {
        this.broadcastPlayerList()
      }
      if (!this.isHost && !this.joinedOnce) {
        this.announce()
      }
    }

    this.trystero.onPeerLeave = (peerId) => {
      dbg(`peer LEAVE: ${peerId.slice(0, 8)}`)
      const playerId = this.peerRev.get(peerId)
      if (playerId) {
        this.peerMap.delete(playerId)
        this.peerRev.delete(peerId)
      }
      if (!this.isHost && playerId === this.hostId) {
        this.emit('hostLost', undefined as never)
        return
      }
      if (this.isHost) {
        this.players = this.players.filter(p => p.id !== playerId)
        this.broadcastPlayerList()
      }
    }
  }

  async connect(): Promise<void> {
    dbg(`connect: isHost=${this.isHost}`)
    if (this.isHost) {
      this.broadcastPlayerList()
      this.lobbyTimer = setInterval(() => {
        if (this.locked || this.destroyed) {
          if (this.lobbyTimer) clearInterval(this.lobbyTimer)
          this.lobbyTimer = null
          return
        }
        this.broadcastPlayerList()
      }, 5000)
    } else {
      this.announce()
      let retries = 0
      this.retryTimer = setInterval(() => {
        if (this.joinedOnce || this.destroyed || retries >= 9) {
          if (this.retryTimer) clearInterval(this.retryTimer)
          this.retryTimer = null
          return
        }
        retries++
        dbg(`retry announce (${retries * 3}s, peers=${Object.keys(this.trystero.getPeers()).length})`)
        this.announce()
      }, 3000)
    }
  }

  private announce(): void {
    dbg('send JOIN_REQUEST')
    this.doSend({
      type: 'JOIN_REQUEST',
      senderId: this.profile.id,
      ts: Date.now(),
      payload: { profile: this.toPublic(this.profile) },
    })
  }

  private onMsg(data: RoomMessage, peerId: string): void {
    const relayed = (data as unknown as Record<string, unknown>)._relayed === true
    if (!relayed && !this.peerRev.has(peerId)) {
      this.peerRev.set(peerId, data.senderId)
      this.peerMap.set(data.senderId, peerId)
      dbg(`mapped peer ${peerId.slice(0, 8)} → player ${data.senderId.slice(0, 8)}`)
    }

    if (this.isHost) {
      this.handleAsHost(data, peerId)
    } else {
      this.handleAsPlayer(data)
    }
    this.emit('message', data)
    this.gossip(data)
  }

  private gossip(msg: RoomMessage): void {
    if (msg.senderId === this.profile.id) return
    const key = `${msg.senderId}:${msg.type}:${msg.ts}`
    if (this.seenMsgs.has(key)) return
    const allow: RoomMessage['type'][] = [
      'JOIN_REQUEST', 'JOIN_REJECT', 'PLAYER_LIST', 'PHASE_CHANGE',
      'ROLE_ASSIGN', 'WORD_SUBMIT', 'WORD_REVEAL',
      'VOTE', 'VOTE_RESULT', 'KILL_VOTE', 'KILL_RESULT',
      'GAME_END', 'GAME_STOP',
    ]
    if (!allow.includes(msg.type)) return
    this.seenMsgs.add(key)
    if (this.seenMsgs.size > 200) this.seenMsgs = new Set([...this.seenMsgs].slice(-100))
    this.broadcastFn({ ...msg, _relayed: true } as unknown as Record<string, unknown>).catch(() => {})
  }

  private onPrivate(data: RoomMessage): void {
    if (!this.isHost) {
      this.handleAsPlayer(data)
    }
    this.emit('message', data)
  }

  private handleAsHost(msg: RoomMessage, peerId: string): void {
    dbg(`host handles: type=${msg.type} from=${peerId.slice(0, 8)}`)
    switch (msg.type) {
      case 'JOIN_REQUEST': {
        if (this.locked) {
          this.doSend(this.makeMsg('JOIN_REJECT', { reason: 'game_started' }))
          return
        }
        const { profile } = msg.payload as JoinRequestPayload
        const existing = this.players.find(p => p.id === profile.id)
        const isRelayed = (msg as unknown as Record<string, unknown>)._relayed === true
          || (this.peerRev.has(peerId) && this.peerRev.get(peerId) !== profile.id)
        if (existing) {
          if (!isRelayed) {
            this.peerMap.set(profile.id, peerId)
            this.peerRev.set(peerId, profile.id)
            existing.peerId = peerId
            this.doSend(this.makeMsg('JOIN_ACCEPT', {}), peerId)
          }
          this.broadcastPlayerList()
          return
        }
        if (!isRelayed) {
          this.peerMap.set(profile.id, peerId)
          this.peerRev.set(peerId, profile.id)
        }
        this.players.push({ ...profile, peerId: isRelayed ? '' : peerId })
        dbg(`added player: ${profile.nickname} (${profile.id.slice(0, 8)}) total=${this.players.length}${isRelayed ? ' [relayed]' : ''}`)
        if (!isRelayed) this.doSend(this.makeMsg('JOIN_ACCEPT', {}), peerId)
        this.broadcastPlayerList()
        break
      }
      case 'PLAYER_LIST': {
        const payload = msg.payload as { hostId: string }
        if (payload.hostId !== this.profile.id) {
          dbg('room collision: another host exists')
          this.emit('error', 'room_taken')
          this.destroy()
        }
        break
      }
      case 'PLAYER_LEAVE': {
        const playerId = this.peerRev.get(peerId) ?? msg.senderId
        this.players = this.players.filter(p => p.id !== playerId)
        this.peerMap.delete(playerId)
        this.peerRev.delete(peerId)
        this.broadcastPlayerList()
        break
      }
      default:
        break
    }
  }

  private handleAsPlayer(msg: RoomMessage): void {
    dbg(`player handles: type=${msg.type}`)
    switch (msg.type) {
      case 'PLAYER_LIST': {
        if (msg.ts < this.lastListTs) break
        this.lastListTs = msg.ts
        const payload = msg.payload as {
          players: PublicPlayer[]; hostId: string; locked: boolean; config: GameConfigPayload
        }
        this.players = payload.players
        this.hostId = payload.hostId
        this.locked = payload.locked
        this.config = payload.config
        dbg(`PLAYER_LIST: ${payload.players.length} players, host=${payload.hostId.slice(0, 8)}`)
        if (!this.joinedOnce) {
          this.joinedOnce = true
          dbg('→ emit joined')
          this.emit('joined', undefined as never)
        }
        this.emit('players', this.players)
        this.emit('locked', this.locked)
        break
      }
      case 'JOIN_ACCEPT':
        dbg('JOIN_ACCEPT received')
        if (!this.joinedOnce) {
          this.joinedOnce = true
          this.emit('joined', undefined as never)
        }
        break
      case 'JOIN_REJECT': {
        if (this.joinedOnce) break
        const payload = msg.payload as { reason: string }
        dbg(`JOIN_REJECT: ${payload.reason}`)
        this.emit('rejected', payload.reason)
        break
      }
      case 'PHASE_CHANGE': {
        const payload = msg.payload as { phase: string; round: number }
        this.emit('phase', payload)
        break
      }
      case 'GAME_STOP':
        this.locked = false
        this.emit('locked', false)
        break
      default:
        break
    }
  }

  private toPublic(p: PlayerProfile): PublicPlayer {
    return { id: p.id, nickname: p.nickname, avatar: p.avatar, peerId: '' }
  }

  private makeMsg(type: RoomMessage['type'], payload: unknown): RoomMessage {
    return { type, senderId: this.profile.id, ts: Date.now(), payload }
  }

  private doSend(msg: RoomMessage, targetPeerId?: string): void {
    if (this.destroyed) return
    const data = msg as unknown as Record<string, unknown>
    const peers = Object.keys(this.trystero.getPeers())
    dbg(`send: type=${msg.type} target=${targetPeerId?.slice(0, 8) ?? 'broadcast'} connectedPeers=${peers.length}`)
    if (targetPeerId) {
      this.sendToFn(data, { target: targetPeerId }).catch(e => dbg('sendTo error:', e))
    } else {
      this.broadcastFn(data).catch(e => dbg('broadcast error:', e))
    }
  }

  broadcastPlayerList(): void {
    this.emit('players', [...this.players])
    this.doSend(this.makeMsg('PLAYER_LIST', {
      players: this.players,
      hostId: this.hostId,
      locked: this.locked,
      config: this.config,
    }))
  }

  sendMsg(type: RoomMessage['type'], payload: unknown): void {
    this.doSend(this.makeMsg(type, payload))
  }

  sendPrivate(playerId: string, type: RoomMessage['type'], payload: unknown): void {
    const peerId = this.peerMap.get(playerId)
    if (peerId) {
      this.doSend(this.makeMsg(type, payload), peerId)
    } else {
      dbg(`sendPrivate: no peerId for player ${playerId.slice(0, 8)}`)
    }
  }

  setConfig(config: GameConfigPayload): void {
    this.config = config
    this.broadcastPlayerList()
  }

  lockRoom(): void {
    this.locked = true
    this.broadcastPlayerList()
  }

  unlockRoom(): void {
    this.locked = false
    this.broadcastPlayerList()
  }

  leave(): void {
    this.doSend(this.makeMsg('PLAYER_LEAVE', {}))
    this.destroy()
  }

  destroy(): void {
    this.destroyed = true
    if (this.retryTimer) {
      clearInterval(this.retryTimer)
      this.retryTimer = null
    }
    if (this.lobbyTimer) {
      clearInterval(this.lobbyTimer)
      this.lobbyTimer = null
    }
    dbg('destroy')
    this.trystero.leave().catch(() => {})
    this.listeners.clear()
  }

  on<K extends keyof RoomEvents>(event: K, fn: Listener<K>): () => void {
    const key = event as string
    if (!this.listeners.has(key)) this.listeners.set(key, new Set())
    this.listeners.get(key)!.add(fn as Listener<never>)
    return () => this.listeners.get(key)?.delete(fn as Listener<never>)
  }

  private emit<K extends keyof RoomEvents>(event: K, data: RoomEvents[K]): void {
    const fns = this.listeners.get(event as string)
    if (fns) for (const fn of fns) (fn as Listener<K>)(data)
  }
}

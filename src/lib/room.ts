import { joinRoom, type Room as TrysteroRoom } from '@trystero-p2p/mqtt'
import type { PlayerProfile, PublicPlayer } from '../store/player'
import type { RoomMessage, GameConfigPayload, JoinRequestPayload } from './protocol'

const APP_ID = 'party-games-v1'
const dbg = (...args: unknown[]) => console.log('[Room]', ...args)

function getRelayUrls(): string[] | undefined {
  const fromUrl = new URLSearchParams(window.location.search).get('mqtt')
  if (fromUrl) {
    localStorage.setItem('party-games:mqtt', fromUrl)
    return [fromUrl]
  }
  const stored = localStorage.getItem('party-games:mqtt')
  if (stored) return [stored]
  return undefined
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
      ...(relayUrls ? { relayConfig: { urls: relayUrls, redundancy: 1 } } : {}),
      rtcConfig: {
        iceServers: [
          { urls: 'stun:stun.miwifi.com:3478' },
          { urls: 'stun:stun.chat.bilibili.com:3478' },
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
      dbg(`peer JOIN: ${peerId.slice(0, 8)} | peers=${Object.keys(this.trystero.getPeers()).length}`)
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
    } else {
      this.announce()
      setTimeout(() => {
        if (!this.joinedOnce && !this.destroyed) {
          dbg('retry announce (2s)')
          this.announce()
        }
      }, 2000)
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
    if (!this.peerRev.has(peerId)) {
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
          this.doSend(this.makeMsg('JOIN_REJECT', { reason: 'game_started' }), peerId)
          return
        }
        const { profile } = msg.payload as JoinRequestPayload
        const existing = this.players.find(p => p.id === profile.id)
        if (existing) {
          // Reconnect: update peer mapping, re-send accept + list
          this.peerMap.set(profile.id, peerId)
          this.peerRev.set(peerId, profile.id)
          existing.peerId = peerId
          this.doSend(this.makeMsg('JOIN_ACCEPT', {}), peerId)
          this.broadcastPlayerList()
          return
        }
        this.peerMap.set(profile.id, peerId)
        this.peerRev.set(peerId, profile.id)
        this.players.push({ ...profile, peerId })
        dbg(`added player: ${profile.nickname} (${profile.id.slice(0, 8)}) total=${this.players.length}`)
        this.doSend(this.makeMsg('JOIN_ACCEPT', {}), peerId)
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

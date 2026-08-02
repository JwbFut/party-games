import mqtt from 'mqtt'
import type { MqttClient } from 'mqtt'
import type { PlayerProfile, PublicPlayer } from '../store/player'
import type {
  RoomMessage, GameConfigPayload, JoinRequestPayload,
  PlayerListPayload, JoinRejectPayload, PhaseChangePayload, AckPayload,
} from './protocol'

const APP_ID = 'org-jawbts-party-games-v1'
const dbg = (...args: unknown[]) => console.log('[Room]', ...args)

function getMqttBrokerUrl(): string {
  const fromUrl = new URLSearchParams(window.location.search).get('mqtt')
  if (fromUrl) {
    if (!fromUrl.includes('localhost') && !fromUrl.includes('127.0.0.1')) {
      localStorage.setItem('party-games:mqtt', fromUrl)
    }
    dbg(`broker (from URL param): ${fromUrl}`)
    return fromUrl
  }
  const stored = localStorage.getItem('party-games:mqtt')
  if (stored) {
    dbg(`broker (from localStorage): ${stored}`)
    return stored
  }
  const defaultBroker = 'wss://broker.emqx.io:8084/mqtt'
  dbg(`broker: ${defaultBroker}`)
  return defaultBroker
}

type Listener<K extends keyof RoomEvents> = (data: RoomEvents[K]) => void
type WireMessage = RoomMessage & { _cid: string; msgId?: string; ack?: boolean }

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

  private client: MqttClient
  private clientId: string
  private base: string
  private roomTopic: string
  private dmTopic: string
  private listeners = new Map<string, Set<Listener<never>>>()
  private destroyed = false
  private joinedOnce = false
  private retryTimer: ReturnType<typeof setInterval> | null = null
  private lobbyTimer: ReturnType<typeof setInterval> | null = null
  private lastListTs = 0
  private msgSeq = 0
  private pending = new Map<string, { msg: WireMessage; topic: string; retries: number; nextAt: number }>()
  private ackTimer: ReturnType<typeof setInterval> | null = null
  private seen = new Set<string>()

  constructor(code: string, profile: PlayerProfile, isHost: boolean) {
    this.code = code
    this.profile = profile
    this.isHost = isHost
    if (isHost) {
      this.hostId = profile.id
      this.players = [this.toPublic(profile)]
    }

    this.clientId = `pg-${Math.random().toString(36).slice(2, 10)}`
    this.base = `${APP_ID}/${code}`
    this.roomTopic = `${this.base}/room`
    this.dmTopic = `${this.base}/dm/${profile.id}`

    dbg(`init: code=${code} isHost=${isHost} id=${profile.id.slice(0, 8)}`)

    // Last-will: published by the broker if this client drops ungracefully.
    // Hosts announce HOST_LOST; players announce their own PLAYER_LEAVE.
    const will = {
      type: isHost ? 'HOST_LOST' : 'PLAYER_LEAVE',
      senderId: profile.id,
      ts: Date.now(),
      seq: -1,
      payload: {},
      _cid: this.clientId,
    }

    this.client = mqtt.connect(getMqttBrokerUrl(), {
      clientId: this.clientId,
      clean: true,
      keepalive: 30,
      connectTimeout: 4000,
      reconnectPeriod: 1000,
      will: {
        topic: this.roomTopic,
        payload: JSON.stringify(will),
        qos: 0,
        retain: false,
      },
    })

    this.client.on('connect', () => {
      dbg('mqtt connected')
      this.client.subscribe([this.roomTopic, this.dmTopic], { qos: 0 }, (err) => {
        if (err) dbg('subscribe error:', err)
        this.onReady()
      })
    })

    this.client.on('message', (_topic, payload) => {
      let data: WireMessage
      try {
        data = JSON.parse(payload.toString()) as WireMessage
      } catch {
        return
      }
      if (data._cid === this.clientId) return // ignore our own publishes
      this.onMsg(data)
    })

    this.client.on('error', (err) => dbg('mqtt error:', err.message))
  }

  async connect(): Promise<void> {
    dbg(`connect: isHost=${this.isHost}`)
    if (this.client.connected) return
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error('mqtt connect timeout'))
      }, 10000)
      const onConnect = () => {
        cleanup()
        resolve()
      }
      const onError = (err: Error) => {
        cleanup()
        reject(err)
      }
      const cleanup = () => {
        clearTimeout(timer)
        this.client.removeListener('connect', onConnect)
        this.client.removeListener('error', onError)
      }
      this.client.on('connect', onConnect)
      this.client.on('error', onError)
    })
  }

  private onReady(): void {
    if (this.destroyed) return
    if (this.isHost) {
      this.broadcastPlayerList()
      if (!this.lobbyTimer) {
        this.lobbyTimer = setInterval(() => {
          if (this.locked || this.destroyed) {
            if (this.lobbyTimer) clearInterval(this.lobbyTimer)
            this.lobbyTimer = null
            return
          }
          this.broadcastPlayerList()
        }, 5000)
      }
    } else {
      this.announce()
      if (!this.retryTimer) {
        // Keep announcing until we join: a host that is offline now may come
        // back online later (e.g. reopens their browser), and a fresh
        // JOIN_REQUEST published after they subscribe is what reaches them.
        this.retryTimer = setInterval(() => {
          if (this.joinedOnce || this.destroyed) {
            if (this.retryTimer) clearInterval(this.retryTimer)
            this.retryTimer = null
            return
          }
          this.announce()
        }, 5000)
      }
    }
  }

  private announce(): void {
    dbg('send JOIN_REQUEST')
    this.publish(this.roomTopic, this.makeMsg('JOIN_REQUEST', { profile: this.toPublic(this.profile) }))
  }

  private onMsg(data: WireMessage): void {
    if (data.type === 'ACK') {
      this.handleAck(data)
      return
    }
    if (data.type === 'HOST_LOST') {
      if (!this.isHost) {
        dbg('host lost')
        this.emit('hostLost', undefined as never)
      }
      return
    }

    // Reliable-message handling: dedup by msgId and acknowledge the sender.
    if (data.msgId) {
      if (this.seen.has(data.msgId)) {
        if (data.ack) this.sendAck(data) // re-ack so the sender stops retrying
        return
      }
      this.seen.add(data.msgId)
      if (this.seen.size > 500) this.seen = new Set([...this.seen].slice(-250))
      if (data.ack) this.sendAck(data)
    }

    if (this.isHost) {
      this.handleAsHost(data)
    } else {
      this.handleAsPlayer(data)
    }
    this.emit('message', data)
  }

  private handleAsHost(msg: RoomMessage): void {
    dbg(`host handles: type=${msg.type} from=${msg.senderId.slice(0, 8)}`)
    switch (msg.type) {
      case 'JOIN_REQUEST': {
        const { profile } = msg.payload as JoinRequestPayload
        if (this.locked) {
          // Roster is frozen once the game starts. A matching id is a
          // reconnecting player — re-accept and let the game resync it.
          if (this.players.some(p => p.id === profile.id)) {
            dbg(`reconnect player: ${profile.nickname} (${profile.id.slice(0, 8)})`)
            this.sendDirect(profile.id, this.makeMsg('JOIN_ACCEPT', {}))
            this.sendDirect(profile.id, this.makeMsg('PLAYER_LIST', {
              players: this.players, hostId: this.hostId, locked: this.locked, config: this.config,
            }))
          } else {
            this.sendDirect(msg.senderId, this.makeMsg('JOIN_REJECT', { reason: 'game_started' }))
          }
          return
        }
        const existing = this.players.find(p => p.id === profile.id)
        if (existing) {
          dbg(`re-accept player: ${profile.nickname} (${profile.id.slice(0, 8)})`)
          this.sendDirect(profile.id, this.makeMsg('JOIN_ACCEPT', {}))
          this.broadcastPlayerList()
          return
        }
        this.players.push({ ...profile })
        dbg(`added player: ${profile.nickname} (${profile.id.slice(0, 8)}) total=${this.players.length}`)
        this.sendDirect(profile.id, this.makeMsg('JOIN_ACCEPT', {}))
        this.broadcastPlayerList()
        break
      }
      case 'PLAYER_LIST': {
        const payload = msg.payload as PlayerListPayload
        // Deterministic tie-break: the host with the "larger" id yields, so
        // exactly one host survives a room-code collision.
        if (payload.hostId !== this.profile.id && payload.hostId < this.profile.id) {
          dbg('room collision: yielding to earlier host')
          this.emit('error', 'room_taken')
          this.destroy()
        }
        break
      }
      case 'PLAYER_LEAVE': {
        if (this.locked) break // roster frozen during game; the player may reconnect
        const before = this.players.length
        this.players = this.players.filter(p => p.id !== msg.senderId)
        if (this.players.length !== before) this.broadcastPlayerList()
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
        const payload = msg.payload as PlayerListPayload
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
        const payload = msg.payload as JoinRejectPayload
        dbg(`JOIN_REJECT: ${payload.reason}`)
        this.emit('rejected', payload.reason)
        break
      }
      case 'PHASE_CHANGE': {
        const payload = msg.payload as PhaseChangePayload
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

  private makeMsg(type: RoomMessage['type'], payload: unknown): WireMessage {
    return { type, senderId: this.profile.id, ts: Date.now(), seq: this.msgSeq++, payload, _cid: this.clientId }
  }

  private publish(topic: string, msg: WireMessage): void {
    if (this.destroyed) return
    this.client.publish(topic, JSON.stringify(msg), { qos: 0 })
  }

  private sendDirect(playerId: string, msg: WireMessage): void {
    this.publish(`${this.base}/dm/${playerId}`, msg)
  }

  broadcastPlayerList(): void {
    this.emit('players', [...this.players])
    this.publish(this.roomTopic, this.makeMsg('PLAYER_LIST', {
      players: this.players,
      hostId: this.hostId,
      locked: this.locked,
      config: this.config,
    }))
  }

  sendMsg(type: RoomMessage['type'], payload: unknown): void {
    this.publish(this.roomTopic, this.makeMsg(type, payload))
  }

  sendPrivate(playerId: string, type: RoomMessage['type'], payload: unknown): void {
    this.sendDirect(playerId, this.makeMsg(type, payload))
  }

  // Reliable send to the host: queued, acknowledged, and retried (backoff capped
  // at 5s) until the host ACKs. Used for player actions that must not be lost.
  sendReliable(type: RoomMessage['type'], payload: unknown): void {
    if (!this.hostId) {
      dbg(`sendReliable: no hostId for ${type}`)
      return
    }
    const msg = this.makeMsg(type, payload)
    const msgId = `${msg.senderId}:${msg.seq}`
    const wire: WireMessage = { ...msg, msgId, ack: true }
    const topic = `${this.base}/dm/${this.hostId}`
    this.pending.set(msgId, { msg: wire, topic, retries: 0, nextAt: Date.now() })
    this.publish(topic, wire)
    this.ensureAckTimer()
  }

  private ensureAckTimer(): void {
    if (this.ackTimer) return
    this.ackTimer = setInterval(() => this.flushPending(), 500)
  }

  private flushPending(): void {
    const now = Date.now()
    for (const entry of this.pending.values()) {
      if (now >= entry.nextAt) {
        entry.retries++
        entry.nextAt = now + Math.min(500 * 2 ** entry.retries, 5000)
        this.publish(entry.topic, entry.msg)
      }
    }
    if (this.pending.size === 0 && this.ackTimer) {
      clearInterval(this.ackTimer)
      this.ackTimer = null
    }
  }

  private handleAck(data: WireMessage): void {
    const { msgId } = data.payload as AckPayload
    this.pending.delete(msgId)
  }

  private sendAck(data: WireMessage): void {
    if (!data.msgId) return
    this.sendDirect(data.senderId, this.makeMsg('ACK', { msgId: data.msgId }))
  }

  setConfig(config: GameConfigPayload): void {
    this.config = config
    this.broadcastPlayerList()
  }

  // Restore the host's room state after the host reloads the page. The game
  // state itself lives in WerewolfGame; this revives the roster/lock so the
  // host can answer reconnecting players again.
  restoreAsHost(players: PublicPlayer[], config: GameConfigPayload): void {
    this.players = players
    this.config = config
    this.locked = true
    this.hostId = this.profile.id
    this.emit('locked', true)
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
    if (this.isHost) {
      this.publish(this.roomTopic, this.makeMsg('HOST_LOST', {}))
    } else {
      this.publish(this.roomTopic, this.makeMsg('PLAYER_LEAVE', {}))
    }
    this.destroy()
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    if (this.retryTimer) {
      clearInterval(this.retryTimer)
      this.retryTimer = null
    }
    if (this.lobbyTimer) {
      clearInterval(this.lobbyTimer)
      this.lobbyTimer = null
    }
    if (this.ackTimer) {
      clearInterval(this.ackTimer)
      this.ackTimer = null
    }
    this.pending.clear()
    this.seen.clear()
    dbg('destroy')
    this.listeners.clear()
    // Graceful end sends DISCONNECT, which suppresses the last-will.
    this.client.end()
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

import { useEffect, useRef, useState } from 'react'
import { joinRoom } from '@trystero-p2p/mqtt'

export default function DebugPage() {
  const [log, setLog] = useState<string[]>([])
  const roomRef = useRef<ReturnType<typeof joinRoom> | null>(null)

  const addLog = (msg: string) => {
    const line = `${new Date().toLocaleTimeString()} ${msg}`
    console.log('[Debug]', line)
    setLog(prev => [...prev.slice(-100), line])
  }

  useEffect(() => {
    addLog('joining room "test123" via MQTT...')

    const room = joinRoom({
      appId: 'pg-debug',
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
    }, 'test123')
    roomRef.current = room

    room.onPeerJoin = (peerId) => {
      addLog(`✅ PEER JOINED: ${peerId}`)
      const pc = room.getPeers()[peerId]
      if (pc) {
        addLog(`   RTC state: ${pc.connectionState} / ICE: ${pc.iceConnectionState}`)
        pc.onconnectionstatechange = () => {
          addLog(`   ⚡ RTC state → ${pc.connectionState} / ICE: ${pc.iceConnectionState}`)
        }
        pc.oniceconnectionstatechange = () => {
          addLog(`   ⚡ ICE → ${pc.iceConnectionState}`)
        }
      }
    }

    room.onPeerLeave = (peerId) => {
      addLog(`❌ PEER LEFT: ${peerId}`)
    }

    const ping = room.makeAction('ping')
    ping.onMessage = (data: unknown, ctx: { peerId: string }) => {
      addLog(`📩 PING from ${ctx.peerId.slice(0, 12)}: ${JSON.stringify(data)}`)
    }

    addLog('room created. open /debug in another tab.')

    const interval = setInterval(() => {
      const peers = room.getPeers()
      const ids = Object.keys(peers)
      if (ids.length > 0) {
        for (const id of ids) {
          const pc = peers[id]
          addLog(`peer ${id.slice(0, 12)}: RTC=${pc.connectionState} ICE=${pc.iceConnectionState}`)
        }
        ping.send({ t: Date.now() }).catch((e: unknown) => addLog(`send err: ${e}`))
      } else {
        addLog('peers: 0 (waiting...)')
      }
    }, 3000)

    return () => {
      clearInterval(interval)
      room.leave()
    }
  }, [])

  return (
    <div style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '13px' }}>
      <h3>Trystero MQTT Debug</h3>
      <p style={{ color: '#888' }}>Open /debug in two tabs. Look for ✅ and RTC/ICE state.</p>
      <div style={{ background: '#111', padding: '1rem', borderRadius: '8px', maxHeight: '70vh', overflow: 'auto' }}>
        {log.map((l, i) => (
          <div key={i} style={{
            color: l.includes('✅') ? '#2ed573'
              : l.includes('❌') ? '#ff4757'
              : l.includes('⚡') ? '#ffa502'
              : l.includes('📩') ? '#70a1ff'
              : '#999',
          }}>
            {l}
          </div>
        ))}
      </div>
    </div>
  )
}

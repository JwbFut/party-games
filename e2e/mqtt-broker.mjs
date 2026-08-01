/**
 * Minimal MQTT-over-WebSocket broker for E2E testing.
 * Usage: node e2e/mqtt-broker.mjs [port]
 */
import { createServer } from 'node:http'
import { Duplex } from 'node:stream'
import { WebSocketServer } from 'ws'
import aedes from 'aedes'

const port = Number(process.argv[2]) || 18830

const broker = aedes()
const server = createServer()
const wss = new WebSocketServer({ server })

function wsToDuplex(socket) {
  const stream = new Duplex({
    read() {},
    write(chunk, _enc, cb) {
      if (socket.readyState === 1) socket.send(chunk, { binary: true }, cb)
      else cb()
    },
    final(cb) { socket.close(); cb() },
  })
  socket.binaryType = 'nodebuffer'
  socket.on('message', (data) => { if (!stream.destroyed) stream.push(data) })
  socket.on('close', () => { if (!stream.destroyed) stream.push(null) })
  socket.on('error', (e) => { if (!stream.destroyed) stream.destroy(e) })
  return stream
}

wss.on('connection', (socket) => {
  broker.handle(wsToDuplex(socket))
})

server.listen(port, () => {
  console.log(`[mqtt-broker] ws://localhost:${port}`)
})

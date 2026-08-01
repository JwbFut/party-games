import { spawn, execSync, type ChildProcess } from 'node:child_process'

const PORT = 18830
let broker: ChildProcess

function killStale() {
  try {
    execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`, { stdio: 'ignore' })
  } catch { /* ignore */ }
}

export default async function globalSetup() {
  killStale()
  await new Promise(r => setTimeout(r, 500))

  broker = spawn('node', ['e2e/mqtt-broker.mjs', String(PORT)], {
    stdio: 'pipe',
    cwd: process.cwd(),
  })

  broker.stderr?.on('data', (d: Buffer) => console.error('[broker]', d.toString()))

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      broker.kill('SIGKILL')
      reject(new Error(`MQTT broker start timeout on port ${PORT}`))
    }, 8000)
    broker.stdout?.on('data', (d: Buffer) => {
      if (d.toString().includes(`ws://localhost:${PORT}`)) {
        clearTimeout(timeout)
        resolve()
      }
    })
    broker.on('error', (err) => { clearTimeout(timeout); reject(err) })
  })

  console.log(`[global-setup] MQTT broker on ws://localhost:${PORT}`)

  // Playwright uses the returned function as teardown
  return () => {
    broker.kill('SIGTERM')
    setTimeout(() => { try { broker.kill('SIGKILL') } catch { /* dead */ } }, 2000)
  }
}

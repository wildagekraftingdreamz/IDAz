// Boots Vite, waits until it serves, then launches Electron pointed at it.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// Vite 7 does not export its CLI through package exports, so resolve the file.
const viteBin = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js')
if (!fs.existsSync(viteBin)) {
  console.error(`[dev] could not find the local Vite CLI at ${viteBin}`)
  process.exit(1)
}
const url = 'http://localhost:5199'

const vite = spawn(process.execPath, [viteBin, '--port', '5199', '--strictPort'], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: { ...process.env, FORCE_COLOR: '1' },
})

let electron = null
let stopping = false

async function waitForServer(timeoutMs = 45_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1200) })
      if (res.ok) return true
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 350))
  }
  return false
}

function stop(code = 0) {
  if (stopping) return
  stopping = true
  if (electron && electron.exitCode === null) electron.kill()
  if (vite.exitCode === null) vite.kill()
  setTimeout(() => process.exit(code), 350)
}

const ready = await waitForServer()
if (!ready) {
  console.error('[dev] Vite did not start on ' + url)
  stop(1)
} else {
  electron = spawn(electronPath, ['.', ...process.argv.slice(2)], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: { ...process.env, VITE_DEV_SERVER_URL: url, IDAZ_DEBUG: '1' },
  })
  electron.on('exit', (code) => stop(code ?? 0))
}

vite.on('exit', (code) => {
  if (!stopping) stop(code ?? 0)
})
process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))

// Upstream contract scanner for dsh-maestro-mobile.
//
// Loads the live DSH Web page with touch emulation (the mobile branch must be
// armed), reads docs/upstream/compat-contracts.json, and reports HIT / MISS /
// SKIP for every contract:
//   - kind "marker": the selector must match at least one element;
//   - kind "hash":   the fragment must appear in some element's class list.
// A MISS on a contract with lazy:false fails the run (exit 1). A MISS on a
// lazy contract is reported as SKIP with the manual state that would reveal it,
// because that markup only exists in some states.
//
// Env: DSH_PROBE_URL (default http://127.0.0.1:3080/),
//      DSH_PROBE_SESSION_ID (required — the session the page selects),
//      DSH_PROBE_CHROME (default chromium), DSH_PROBE_TIMEOUT_MS (default 30000),
//      DSH_CONTRACTS (default docs/upstream/compat-contracts.json).
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import net from 'node:net'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_CONTRACTS = resolve(HERE, '..', 'docs', 'upstream', 'compat-contracts.json')
const DEFAULT_URL = 'http://127.0.0.1:3080/'
const DEFAULT_TIMEOUT_MS = 30_000

function allocatePort() {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolvePort(port))
    })
    server.on('error', reject)
  })
}

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep(ms)))

async function waitFor(label, timeoutMs, probe) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await probe()
    if (value) return value
    if (Date.now() > deadline) throw new Error(`timeout waiting for ${label}`)
    await sleep(120)
  }
}

function createCdpClient(ws) {
  let messageId = 0
  const pending = new Map()
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (!message.id) return
    const entry = pending.get(message.id)
    if (!entry) return
    pending.delete(message.id)
    if (message.error) entry.reject(new Error(JSON.stringify(message.error)))
    else entry.resolve(message.result)
  }
  const send = (method, params = {}) => new Promise((resolveSend, reject) => {
    const id = ++messageId
    pending.set(id, { resolve: resolveSend, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  return { send, evaluate, close: () => { try { ws.close() } catch { /* best effort */ } } }
}

async function main() {
  const contractsPath = process.env.DSH_CONTRACTS || DEFAULT_CONTRACTS
  const manifest = JSON.parse(await readFile(contractsPath, 'utf8'))
  const url = process.env.DSH_PROBE_URL || DEFAULT_URL
  const sessionId = process.env.DSH_PROBE_SESSION_ID?.trim()
  if (!sessionId) throw new Error('DSH_PROBE_SESSION_ID is required')
  const timeoutMs = Number(process.env.DSH_PROBE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)

  const port = await allocatePort()
  const profileDir = await mkdtemp(join(homedir(), '.cache', 'dsh-mobile-contracts-'))
  const chrome = spawn(process.env.DSH_PROBE_CHROME || 'chromium', [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ], { stdio: 'ignore' })

  let client = null
  const results = []
  try {
    const target = await waitFor('chrome target', timeoutMs, async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json`)
        if (!response.ok) return null
        const targets = await response.json()
        return targets.find((candidate) => candidate.type === 'page') || null
      } catch {
        return null
      }
    })
    const ws = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolveOpen, reject) => {
      ws.onopen = resolveOpen
      ws.onerror = () => reject(new Error('CDP WebSocket connection failed'))
    })
    client = createCdpClient(ws)
    await client.send('Page.enable')
    await client.send('Runtime.enable')
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 2, mobile: true, hasTouch: true,
    })
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `localStorage.setItem('dsh.sessions.current', ${JSON.stringify(JSON.stringify({ sessionId }))})`,
    })
    await client.send('Page.navigate', { url })

    await waitFor('mobile plugin boot', timeoutMs, async () => {
      try {
        return await client.evaluate(`document.querySelector('style[data-plugin="@ddtcorex/dsh-maestro-mobile"]') !== null
          && matchMedia('(pointer: coarse)').matches`)
      } catch {
        return false
      }
    })

    // Collect every class fragment on the page once, then test each needle.
    const fragments = await client.evaluate(`(() => {
      const out = new Set();
      for (const element of document.querySelectorAll('*')) {
        const list = element.classList;
        for (let i = 0; i < list.length; i++) out.add(list[i]);
      }
      return [...out];
    })()`)
    const fragmentBlob = fragments.join(' ')

    for (const contract of manifest.contracts) {
      const isMarker = contract.kind === 'marker'
      const hit = isMarker
        ? await client.evaluate(`document.querySelector(${JSON.stringify(contract.needle)}) !== null`)
        : fragmentBlob.includes(contract.needle)
      if (hit) results.push({ status: 'HIT', contract })
      else results.push({ status: contract.lazy ? 'SKIP' : 'MISS', contract })
    }

    // Lazy contracts stay SKIP: their markup only exists in a state this
    // cold-start scan is not in (a drawer with rows, a row menu, Settings).
    // The drawer and row-menu anchors of the delete flow are exercised live by
    // `pnpm probe:session-delete`, which drives exactly those states.
  } finally {
    client?.close()
    chrome.kill('SIGKILL')
    await sleep(300)
    await rm(profileDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  }

  for (const entry of results) {
    const { status, contract } = entry
    const state = contract.lazy && contract.state ? ` (state: ${contract.state})` : ''
    console.log(`${status} ${contract.id} [${contract.owner}] ${contract.needle}${status === 'SKIP' ? state : ''}`)
  }
  const misses = results.filter((entry) => entry.status === 'MISS').length
  const hits = results.filter((entry) => entry.status === 'HIT').length
  const skips = results.filter((entry) => entry.status === 'SKIP').length
  console.log(`SUMMARY hit=${hits} skip=${skips} miss=${misses}`)
  if (misses > 0) {
    console.log('MISS means an upstream contract this plugin relies on is gone: read the note for that entry and fix the rule before shipping.')
  }
  process.exitCode = misses > 0 ? 1 : 0
}

await main()

// CDP probe for the pointer gate (dsh-maestro-mobile).
//
// The mobile branch must arm only when the viewport is narrow AND the primary
// pointer is coarse. This probe asserts both sides of that predicate on one
// page, because the failure mode it guards against is silent: headless Chrome
// reports (pointer: none) unless touch emulation is on, so a probe that forgets
// it tests the desktop shell while claiming to test mobile.
//
// Env: DSH_PROBE_URL (default http://127.0.0.1:3080/),
//      DSH_PROBE_SESSION_ID (required), DSH_PROBE_CHROME (default chromium),
//      DSH_PROBE_TIMEOUT_MS (default 30000).
// Exits 0 only when every check passes.
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import net from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DEFAULT_URL = 'http://127.0.0.1:3080/'
const DEFAULT_TIMEOUT_MS = 30_000
const FRAME_SELECTOR = '[data-mobile-nav="frame"]'
const MOBILE_STYLE_SELECTOR = 'style[data-plugin="@ddtcorex/dsh-maestro-mobile"]'
const CONTROLS = ['[data-mobile-nav="toggle"]', '[data-mobile-nav="fab"]', '[data-mobile-nav="backdrop"]']

const results = []
const report = (status, name, detail = '') => {
  results.push({ status, name, detail })
  console.log(`${status} ${name}${detail ? ` ${detail}` : ''}`)
}
const pass = (name, detail = '') => report('PASS', name, detail)
const fail = (name, detail = '') => report('FAIL', name, detail)

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

async function setProfile(client, { width, height, touch }) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 2, mobile: touch, hasTouch: touch,
  })
  await client.send('Emulation.setTouchEmulationEnabled', {
    enabled: touch,
    ...(touch ? { maxTouchPoints: 5 } : {}),
  })
}

const snapshot = (client) => client.evaluate(`(() => {
  const visible = (selector) => {
    const element = document.querySelector(selector);
    if (element === null) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  return {
    coarse: matchMedia('(pointer: coarse)').matches,
    none: matchMedia('(pointer: none)').matches,
    fine: matchMedia('(pointer: fine)').matches,
    frame: document.querySelector(${JSON.stringify(FRAME_SELECTOR)}) !== null,
    controls: ${JSON.stringify(CONTROLS)}.map((selector) => visible(selector)),
  };
})()`)

async function main() {
  const url = process.env.DSH_PROBE_URL || DEFAULT_URL
  const sessionId = process.env.DSH_PROBE_SESSION_ID?.trim()
  if (!sessionId) throw new Error('DSH_PROBE_SESSION_ID is required')
  const timeoutMs = Number(process.env.DSH_PROBE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)

  const port = await allocatePort()
  const profileDir = await mkdtemp(join(homedir(), '.cache', 'dsh-mobile-pointer-'))
  const chrome = spawn(process.env.DSH_PROBE_CHROME || 'chromium', [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ], { stdio: 'ignore' })

  let client = null
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
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `localStorage.setItem('dsh.sessions.current', ${JSON.stringify(JSON.stringify({ sessionId }))})`,
    })

    // Touch profile: the mobile branch must arm.
    await setProfile(client, { width: 390, height: 844, touch: true })
    await client.send('Page.navigate', { url })
    const mobile = await waitFor('mobile branch arm', timeoutMs, async () => {
      try {
        const state = await snapshot(client)
        return state.frame && state.coarse ? state : null
      } catch {
        return null
      }
    })
    pass('pointer.mobile-armed', `coarse=${mobile.coarse} frame=${mobile.frame}`)
    // Which control is on screen depends on the drawer state: the backdrop with
    // the drawer open, the FAB / header toggle with it closed. The cold-start
    // page opens the drawer, so asserting "a FAB is visible" would be wrong.
    const controlState = await client.evaluate(`(() => {
      const visible = (selector) => {
        const element = document.querySelector(selector);
        if (element === null) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const frame = document.querySelector(${JSON.stringify(FRAME_SELECTOR)});
      return {
        collapsed: frame === null ? null : frame.hasAttribute('data-sidebar-collapsed'),
        fab: visible('[data-mobile-nav="fab"]'),
        toggle: visible('[data-mobile-nav="toggle"]'),
        backdrop: visible('[data-mobile-nav="backdrop"]'),
      };
    })()`)
    const controlOk = controlState.collapsed === true
      ? controlState.fab || controlState.toggle
      : controlState.backdrop
    if (controlOk) pass('pointer.mobile-controls', `collapsed=${controlState.collapsed} ${JSON.stringify(controlState)}`)
    else fail('pointer.mobile-controls', JSON.stringify(controlState))

    // Fine-pointer narrow window: the plugin must be a complete no-op.
    await setProfile(client, { width: 900, height: 800, touch: false })
    const desktop = await waitFor('narrow desktop no-op', timeoutMs, async () => {
      try {
        const state = await snapshot(client)
        return !state.coarse && !state.frame ? state : null
      } catch {
        return null
      }
    })
    pass('pointer.desktop-narrow', `coarse=${desktop.coarse} none=${desktop.none} fine=${desktop.fine} frame=${desktop.frame}`)
    if (desktop.controls.every((visible) => visible === false)) pass('pointer.desktop-controls', 'hidden')
    else fail('pointer.desktop-controls', `visible=${desktop.controls.filter(Boolean).length}`)

    // Crossing back must re-arm (the predicate is a live media query).
    await setProfile(client, { width: 390, height: 844, touch: true })
    const rearmed = await waitFor('mobile re-arm', timeoutMs, async () => {
      try {
        const state = await snapshot(client)
        return state.frame && state.coarse ? state : null
      } catch {
        return null
      }
    })
    pass('pointer.rearm', `frame=${rearmed.frame} coarse=${rearmed.coarse}`)

    const styled = await client.evaluate(`document.querySelector(${JSON.stringify(MOBILE_STYLE_SELECTOR)}) !== null`)
    if (styled) pass('pointer.style-tag', 'present')
    else fail('pointer.style-tag', 'plugin stylesheet missing')
  } finally {
    client?.close()
    chrome.kill('SIGKILL')
    await sleep(300)
    await rm(profileDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  }

  const failures = results.filter((entry) => entry.status === 'FAIL').length
  console.log(`SUMMARY pass=${results.filter((entry) => entry.status === 'PASS').length} fail=${failures}`)
  process.exitCode = failures > 0 ? 1 : 0
}

await main()

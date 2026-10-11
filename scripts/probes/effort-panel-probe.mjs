// CDP probe for the effort grade panel width (dsh-maestro-mobile).
//
// The host holds every menu at min-width:240px, so on a phone the six short
// effort grades (Default…Xhigh) filled a 248px fixed card for ~10-char labels
// (port of dsh-web-mobile v3.0.6 PR #205). The plugin shrink-wraps only the
// grade shell (role=menu with direct menuitemradio children); the model
// catalog shell holds menuitem rows and must keep the host size. This probe
// opens both menus live at 390px and asserts the geometry each leaves behind:
//   1. the model catalog menu keeps the host width (>= 200px);
//   2. the effort grade shell is shrink-wrapped (<= 160px, min-width 0).
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
    await sleep(150)
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
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails).slice(0, 300))
    return result.result.value
  }
  return { send, evaluate, close: () => { try { ws.close() } catch { /* best effort */ } } }
}

/** Geometry of the currently open menu shells. */
const MENU_STATE = `(() => {
  const round = (n) => Math.round(n * 100) / 100
  return [...document.querySelectorAll('[role="menu"]')].map((menu) => {
    const box = menu.getBoundingClientRect()
    const kids = [...menu.children].map((c) => c.getAttribute('role'))
    return {
      w: round(box.width), x: round(box.x),
      minWidth: getComputedStyle(menu).minWidth,
      hasRadios: kids.includes('menuitemradio'),
      hasItems: kids.includes('menuitem'),
      radioCount: kids.filter((k) => k === 'menuitemradio').length,
    }
  })
})()`

async function main() {
  const url = process.env.DSH_PROBE_URL || DEFAULT_URL
  const sessionId = process.env.DSH_PROBE_SESSION_ID?.trim()
  if (!sessionId) throw new Error('DSH_PROBE_SESSION_ID is required')
  const timeoutMs = Number(process.env.DSH_PROBE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)

  const port = await allocatePort()
  const profileDir = await mkdtemp(join(homedir(), '.cache', 'dsh-effort-panel-'))
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
    await sleep(1200)

    // 1. Open the model catalog and record its width (host size must survive).
    const triggerFound = await waitFor('model trigger', timeoutMs, () => client.evaluate(
      `[...document.querySelectorAll('button')].some((b) => (b.getAttribute('aria-label') || '').startsWith('Select model'))`))
    if (!triggerFound) {
      fail('model catalog keeps host size', 'no Select-model trigger rendered')
    } else {
      await client.evaluate(`[...document.querySelectorAll('button')]
        .find((b) => (b.getAttribute('aria-label') || '').startsWith('Select model'))?.click()`)
    }
    const catalog = await waitFor('model catalog menu', timeoutMs, async () => {
      const menus = await client.evaluate(MENU_STATE)
      return menus.length > 0 ? menus : null
    })
    const catalogMenu = catalog.find((m) => m.hasItems && !m.hasRadios)
    if (catalogMenu === undefined) fail('model catalog keeps host size', `no menuitem shell open: ${JSON.stringify(catalog)}`)
    else if (catalogMenu.w >= 200) pass('model catalog keeps host size', `w=${catalogMenu.w}`)
    else fail('model catalog keeps host size', `shrunk to w=${catalogMenu.w}, the radio gate is leaking`)

    // 2. Open the Effort grades and assert the shrink-wrap.
    await client.evaluate(`[...document.querySelectorAll('[role="menuitem"]')]
      .find((x) => /^effort/i.test((x.textContent || '').trim()))?.click()`)
    const grades = await waitFor('effort grade panel', timeoutMs, async () => {
      const menus = await client.evaluate(MENU_STATE)
      return menus.some((m) => m.hasRadios) ? menus : null
    })
    const gradeShell = grades.find((m) => m.hasRadios)
    if (gradeShell.minWidth === '0px') pass('grade shell min-width pressed', 'min-width=0px')
    else fail('grade shell min-width pressed', `min-width=${gradeShell.minWidth}`)
    if (gradeShell.w <= 160) pass('grade shell shrink-wrapped', `w=${gradeShell.w} (host was 248)`)
    else fail('grade shell shrink-wrapped', `w=${gradeShell.w}, expected <= 160`)
    if (gradeShell.radioCount === 6) pass('all six grades visible', 'Default…Xhigh')
    else fail('all six grades visible', `radioCount=${gradeShell.radioCount}`)
  } catch (error) {
    fail('probe completed', String(error).slice(0, 200))
  } finally {
    client?.close()
    chrome.kill('SIGKILL')
    await sleep(300)
    await rm(profileDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  }

  const fails = results.filter((r) => r.status === 'FAIL').length
  const passes = results.filter((r) => r.status === 'PASS').length
  console.log(`SUMMARY pass=${passes} fail=${fails}`)
  process.exitCode = fails > 0 ? 1 : 0
}

await main()

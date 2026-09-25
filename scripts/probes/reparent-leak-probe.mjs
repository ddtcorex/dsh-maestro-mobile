// CDP probe for the "move a host React node" reparent tasks
// (dsh-maestro-mobile): stats-line, settings-toolbar-reparent, git-chip-reparent.
//
// Three tasks relocate a node React owns and must later remove:
//   - `stats-line` moves the TPS readout into the marked stats strip;
//   - `settings-toolbar-reparent` moves the dialog's header into the nav;
//   - `git-chip-reparent` moves the git-graph chip into the composer card.
//
// React removes a child from the parent it RECORDED, not from wherever the node
// now lives, so a moved node can be left behind as an orphan — or make the
// removal throw — when React unmounts the subtree. Upstream hit exactly this
// class and removed both of its reparent tasks for overlay-based placeholders
// (dsh-web-mobile #104/#105). This probe measures whether the fault is present
// here, so the decision to keep or drop a reparent rests on evidence.
//
// Checks, after a dialog open/close cycle AND a session switch:
//   1. exactly one live `[data-mobile-nav="stats"]` strip, and it still sits
//      inside a composer stack (not orphaned outside the phase that owns it);
//   2. no dialog header left parented to a nav once the dialog is closed;
//   3. no page exception and no `console.error` while the unmounts happen.
//
// SCOPE — what this probe does NOT cover: the TPS sub-path only exists while a
// generation is producing output, so an idle host cannot exercise it, and the
// git chip only exists inside a git repository session. A PASS here means "no
// observable leak on this host, in the states reached", not "reparenting is
// safe". Extend the scenario when a session with a live turn is available.
//
// Env: DSH_PROBE_URL (default http://127.0.0.1:3080/),
//      DSH_PROBE_SESSION_ID (required — the session the page selects),
//      DSH_PROBE_PIN (optional; when unset the probe reads
//        ~/.dsh/dsh-maestro-remote/pin; a loopback-trusted listener answers 302
//        with no cookie, which is the expected local outcome),
//      DSH_PROBE_CHROME (default /opt/google/chrome/chrome; the bare
//        `chromium` may be a snap stub — see docs/maintenance/pitfalls.md),
//      DSH_PROBE_TIMEOUT_MS (default 30000).
// Exits 0 only when every required check passes.
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import net from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DEFAULT_URL = 'http://127.0.0.1:3080/'
const DEFAULT_TIMEOUT_MS = 30_000
const FRAME_SELECTOR = '[data-mobile-nav="frame"]'
const MOBILE_STYLE_SELECTOR = 'style[data-plugin="@ddtcorex/dsh-maestro-mobile"]'
const PANEL_SELECTOR = '[class*="_panel"]:has([class*="_navList"])'
const PIN_FILE = join(homedir(), '.dsh', 'dsh-maestro-remote', 'pin')

const results = []
const report = (status, name, detail = '') => {
  results.push({ status, name, detail })
  // Print as the probe runs: a timeout must not hide the checks that passed.
  console.log(`${status} ${name}${detail ? ` ${detail}` : ''}`)
}
const pass = (name, detail = '') => report('PASS', name, detail)
const fail = (name, detail = '') => report('FAIL', name, detail)
const skip = (name, detail = '') => report('SKIP', name, detail)

function readConfig(env = process.env) {
  const parsedUrl = new URL(env.DSH_PROBE_URL || DEFAULT_URL)
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('DSH_PROBE_URL must use http or https')
  }
  const timeoutMs = Number(env.DSH_PROBE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('DSH_PROBE_TIMEOUT_MS must be a positive integer')
  }
  const sessionId = env.DSH_PROBE_SESSION_ID?.trim()
  if (!sessionId) throw new Error('DSH_PROBE_SESSION_ID is required (the session the page selects)')
  return {
    url: parsedUrl,
    sessionId,
    pin: env.DSH_PROBE_PIN?.trim() || null,
    chromePath: env.DSH_PROBE_CHROME || '/opt/google/chrome/chrome',
    timeoutMs,
  }
}

function allocatePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
    server.on('error', reject)
  })
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(label, timeoutMs, probe) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await probe()
    if (value) return value
    if (Date.now() > deadline) throw new Error(`timeout waiting for ${label}`)
    await sleep(120)
  }
}

/** A CDP client that also forwards events (for page errors) to `onEvent`. */
function createCdpClient(ws) {
  let messageId = 0
  const pending = new Map()
  const api = { onEvent: undefined }
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (!message.id) {
      if (typeof api.onEvent === 'function') api.onEvent(message)
      return
    }
    const entry = pending.get(message.id)
    if (!entry) return
    pending.delete(message.id)
    if (message.error) entry.reject(new Error(JSON.stringify(message.error)))
    else entry.resolve(message.result)
  }
  api.send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++messageId
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
  api.evaluate = async (expression) => {
    const result = await api.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  api.close = () => { try { ws.close() } catch { /* best effort */ } }
  return api
}

/**
 * Ask the Maestro proxy for a session cookie when it gates on a PIN.
 * @returns the outcome: a cookie pair, 'not-needed' for a loopback-trusted
 * listener (which answers 302 without a cookie), or 'failed'.
 */
async function mintPinCookie(url, pin) {
  const response = await fetch(new URL('/maestro-login', url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ pin }),
    redirect: 'manual',
  })
  const cookies = response.headers.getSetCookie?.() ?? []
  const cookie = cookies.map((entry) => entry.split(';')[0]).find((entry) => entry.startsWith('maestro_pin='))
  if (cookie !== undefined) return { outcome: 'cookie', cookie }
  if (response.status >= 300 && response.status < 400) return { outcome: 'not-needed' }
  return { outcome: 'failed', status: response.status }
}

/** What a reparent leak would look like in the live DOM. */
const SNAPSHOT = `(() => {
  const strips = [...document.querySelectorAll('[data-mobile-nav="stats"]')];
  return {
    strips: strips.length,
    stripsAlive: strips.filter((strip) => strip.isConnected).length,
    stripsInStack: strips.filter((strip) => strip.closest('[class*="_composerStack"]') !== null).length,
    orphanHeaders: document.querySelectorAll('[class*="_nav"] > [class*="_header"]:not([class*="_headerActions"])').length,
    dialogs: document.querySelectorAll('[aria-modal="true"]').length,
  };
})()`

async function main() {
  const config = readConfig()
  const port = await allocatePort()
  const profileDir = await mkdtemp(join(homedir(), '.cache', 'dsh-maestro-mobile-reparent-'))
  const chrome = spawn(config.chromePath, [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ], { stdio: 'ignore' })

  let client = null
  try {
    const target = await waitFor('chrome target', config.timeoutMs, async () => {
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
    await new Promise((resolve, reject) => {
      ws.onopen = resolve
      ws.onerror = () => reject(new Error('CDP WebSocket connection failed'))
    })
    client = createCdpClient(ws)
    await client.send('Page.enable')
    await client.send('Runtime.enable')
    await client.send('Network.enable')
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 2, mobile: true, hasTouch: true,
    })
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })

    const errors = []
    client.onEvent = (message) => {
      if (message.method === 'Runtime.exceptionThrown') {
        errors.push(message.params.exceptionDetails?.exception?.description ?? 'exception')
      }
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        errors.push(message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '))
      }
    }

    let pin = config.pin
    if (pin === null) {
      try {
        pin = (await readFile(PIN_FILE, 'utf8')).trim()
      } catch {
        pin = null
      }
    }
    if (pin !== null && pin !== '') {
      const attempt = await mintPinCookie(config.url, pin)
      if (attempt.outcome === 'failed') {
        fail('reparent.pin-login', `POST /maestro-login answered ${attempt.status} — the PIN was rejected`)
      } else if (attempt.outcome === 'not-needed') {
        pass('reparent.pin-login', 'loopback-trusted listener, no cookie required')
      } else {
        const [name, value] = attempt.cookie.split('=')
        await client.send('Network.setCookie', { name, value, url: config.url.href, httpOnly: true, sameSite: 'Lax' })
        pass('reparent.pin-login', `cookie ${name} minted`)
      }
    } else {
      skip('reparent.pin-login', 'no PIN configured')
    }

    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `localStorage.setItem('dsh.sessions.current', ${JSON.stringify(JSON.stringify({ sessionId: config.sessionId }))})`,
    })
    await client.send('Page.navigate', { url: config.url.href })
    await waitFor('mobile plugin boot', config.timeoutMs, async () => {
      try {
        return await client.evaluate(`document.querySelector(${JSON.stringify(MOBILE_STYLE_SELECTOR)}) !== null
          && document.querySelector(${JSON.stringify(FRAME_SELECTOR)}) !== null
          && matchMedia('(max-width: 1023px) and (pointer: coarse)').matches`)
      } catch {
        return false
      }
    })
    pass('reparent.armed', 'plugin stylesheet + frame marker + MOBILE_QUERY')

    // Open Settings and close it again: the dialog's header is the node
    // `settings-toolbar-reparent` moves into the nav, and closing unmounts the
    // whole subtree React owns.
    await client.evaluate(`document.querySelector('button[aria-label="Open sidebar"]')?.click()`)
    await sleep(500)
    const openedSettings = await client.evaluate(`(() => {
      const matches = (value) => /^(settings|cài đặt|设置)$/i.test(value.trim());
      const target = [...document.querySelectorAll('button, [role="menuitem"], a')]
        .find((element) => matches(element.getAttribute('aria-label') ?? '') || matches(element.textContent ?? ''));
      if (target === undefined) return false;
      target.click();
      return true;
    })()`)
    if (!openedSettings) {
      fail('reparent.dialog-cycle', 'no Settings entry could be clicked from the drawer')
    } else {
      await waitFor('Settings panel', config.timeoutMs, async () => {
        try {
          return await client.evaluate(`document.querySelector(${JSON.stringify(PANEL_SELECTOR)}) !== null`)
        } catch {
          return false
        }
      })
      const closed = await client.evaluate(`(() => {
        const panel = document.querySelector(${JSON.stringify(PANEL_SELECTOR)});
        const close = panel?.querySelector('[class*="_close"]');
        if (close === undefined || close === null) return false;
        close.click();
        return true;
      })()`)
      await sleep(900)
      const after = await client.evaluate(SNAPSHOT)
      if (!closed) fail('reparent.dialog-cycle', 'the Settings close button was not found')
      else if (after.dialogs !== 0) fail('reparent.dialog-cycle', `dialog still mounted: ${after.dialogs}`)
      else if (after.orphanHeaders !== 0) fail('reparent.dialog-cycle', `orphanHeaders=${after.orphanHeaders}`)
      else pass('reparent.dialog-cycle', 'closed cleanly, no header left in a nav')
    }

    // Open a session row, let the composer mount (that is where the stats strip
    // and the git chip live), then switch to another session and re-measure.
    await client.evaluate(`document.querySelector('button[aria-label="Open sidebar"]')?.click()`)
    await sleep(700)
    const openRow = (index) => client.evaluate(`(() => {
      const rows = [...document.querySelectorAll('[class*="_sessionRow"]')].filter((row) => row.querySelector('button') !== null);
      const target = rows[${index}];
      if (target === undefined) return false;
      target.querySelector('[class*="_title"]')?.click();
      return true;
    })()`)

    if (!await openRow(0)) {
      fail('reparent.session-switch', 'no session row offered an action button to open')
    } else {
      await sleep(2500)
      const before = await client.evaluate(SNAPSHOT)
      await client.evaluate(`document.querySelector('button[aria-label="Open sidebar"]')?.click()`)
      await sleep(700)
      const switched = await openRow(1)
      await sleep(2500)
      const after = await client.evaluate(SNAPSHOT)
      const detail = `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`
      // Two sessions may not exist; re-opening the same one still exercises the
      // unmount/remount of the composer subtree.
      if (after.stripsAlive === 1 && after.stripsInStack === 1) {
        pass('reparent.one-live-strip', `switched=${switched} ${detail}`)
      } else {
        fail('reparent.one-live-strip', detail)
      }
    }

    if (errors.length === 0) pass('reparent.no-page-errors', 'no exception and no console.error')
    else fail('reparent.no-page-errors', errors.slice(0, 3).join(' | ').slice(0, 300))
  } finally {
    client?.close()
    chrome.kill('SIGKILL')
    await rm(profileDir, { recursive: true, force: true }).catch(() => {})
  }

  const failed = results.filter((entry) => entry.status === 'FAIL')
  console.log(`\nSUMMARY pass=${results.filter((e) => e.status === 'PASS').length} fail=${failed.length} skip=${results.filter((e) => e.status === 'SKIP').length}`)
  if (failed.length > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(`probe aborted: ${error.message}`)
  process.exitCode = 1
})

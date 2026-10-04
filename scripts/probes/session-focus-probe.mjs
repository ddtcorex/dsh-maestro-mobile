// CDP probe for the mobile session-switch focus guard (dsh-maestro-mobile).
//
// WHY THIS PROBE IS AN INFO PROBE, NOT A GATE
// --------------------------------------------
// It reports; it never fails. The behaviour under test is "does the soft
// keyboard rise", and no headless browser can answer that: a synthesized touch
// hands DOM focus to the tapped element, and a real IME needs a real WebView
// (docs/maintenance/pitfalls.md, "Headless synthesized touch hands DOM focus
// to the tapped button"). What this probe CAN show is the DOM half of the
// guard — whether the marker was armed at all, whether the editor ended up
// focused, and how the visual viewport moved — which turns a phone session
// from guesswork into "three readings to compare".
//
// It therefore exits 0 unconditionally. A FAIL line below means "this reading
// is unexpected, go look", never "the build is broken".
//
// WHAT TO READ
//   guard-armed       true means session-focus-guard.ts opened its window.
//   editor-focused    true inside the window is the defect this guard exists to
//                     stop (the host focused the editor on the switch).
//   viewport          A real IME shrinking the visual viewport is the thing we
//                     cannot synthesise; headless should show it stable.
// Then confirm on a device: switch sessions with the keyboard down (it must
// stay down), tap the composer (it must open on that tap).
//
// Env: DSH_PROBE_URL (default http://127.0.0.1:3080/),
//      DSH_PROBE_CHROME (default chromium, but that may resolve to a snap stub
//        that never launches — pass /opt/google/chrome/chrome),
//      DSH_PROBE_TIMEOUT_MS (default 30000).
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DEFAULT_URL = 'http://127.0.0.1:3080/'
const DEFAULT_TIMEOUT_MS = 30_000
const FRAME_SELECTOR = '[data-mobile-nav="frame"]'
const EDITOR_SELECTOR = '[data-composer-input]'
/**
 * The HOST's sidebar toggle, by its aria-label — NOT this plugin's own
 * `[data-mobile-nav="toggle"]` rail button. That one is injected into the
 * session header actions band and is absent on the hero screen; clicking it
 * left the drawer collapsed (`_collapsed` still set, zero rows) and the probe
 * reported "found 0 rows". The two other drawer-opening probes
 * (session-delete, settings-sheet) click this same host control.
 */
const DRAWER_TOGGLE_SELECTOR = 'button[aria-label="Open sidebar"]'
const GUARD_MARKER = 'data-mobile-nav-session-guard'
/** The guard window from session-focus-guard.ts; the readings below race it. */
const GUARD_WINDOW_MS = 800

const results = []
const report = (status, name, detail = '') => {
  results.push({ status, name, detail })
  console.log(`${status} ${name}${detail ? ` ${detail}` : ''}`)
}
const info = (name, detail = '') => report('INFO', name, detail)
const warn = (name, detail = '') => report('WARN', name, detail)

function readConfig(env = process.env) {
  const parsedUrl = new URL(env.DSH_PROBE_URL || DEFAULT_URL)
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('DSH_PROBE_URL must use http or https')
  }
  const timeoutMs = Number(env.DSH_PROBE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('DSH_PROBE_TIMEOUT_MS must be a positive integer')
  }
  return {
    url: parsedUrl.href,
    chromePath: env.DSH_PROBE_CHROME || 'chromium',
    timeoutMs,
  }
}

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

const sleep = (resolveAfter) => new Promise((resolveSleep) => setTimeout(resolveSleep, resolveAfter))

function createCdpClient(ws) {
  let messageId = 0
  const pending = new Map()
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (message.id === undefined) return
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

async function connect(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`)
      const targets = await response.json()
      const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl)
      if (page !== undefined) {
        const ws = new WebSocket(page.webSocketDebuggerUrl)
        await new Promise((resolveOpen, rejectOpen) => {
          ws.addEventListener('open', resolveOpen, { once: true })
          ws.addEventListener('error', () => rejectOpen(new Error('chrome websocket failed')), { once: true })
        })
        return createCdpClient(ws)
      }
    } catch { /* chrome is not listening yet */ }
    if (Date.now() > deadline) throw new Error('timeout waiting for the chrome target')
    await sleep(150)
  }
}

async function waitFor(label, timeoutMs, probe) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await probe()
    if (value) return value
    if (Date.now() > deadline) throw new Error(`timeout waiting for ${label}`)
    await sleep(120)
  }
}

/**
 * One snapshot of the focus state, taken in a single evaluate so the marker
 * and the activeElement cannot describe different moments.
 *
 * `docHasFocus` is load-bearing and must never be dropped. Headless Chrome
 * reports `document.hasFocus() === false`, and in that state Blink sets
 * `activeElement` while dispatching NO focus events at all — measured here:
 * calling `editor.focus()` moved activeElement and produced 0 `focusin`
 * events. So in headless the editor reads as focused and NO listener can
 * react, which makes `editorFocused` meaningless and would otherwise report a
 * blur-fallback failure that never happened. The same trap is recorded in
 * composer-focus-release.ts (the heartbeat exists for exactly this reason).
 */
const SNAPSHOT = `(() => {
  const editor = document.querySelector(${JSON.stringify(EDITOR_SELECTOR)});
  const root = document.documentElement;
  const active = document.activeElement;
  return {
    frame: document.querySelector(${JSON.stringify(FRAME_SELECTOR)}) !== null,
    coarse: matchMedia('(pointer: coarse)').matches,
    docHasFocus: document.hasFocus(),
    editorPresent: editor !== null,
    guardedOnEditor: editor !== null && editor.hasAttribute(${JSON.stringify(GUARD_MARKER)}),
    guardedOnRoot: root.hasAttribute(${JSON.stringify(GUARD_MARKER)}),
    editorFocused: editor !== null && active === editor,
    activeTag: active === null ? null : active.tagName.toLowerCase(),
    viewport: window.visualViewport === null
      ? null
      : Math.round(window.visualViewport.height),
    innerHeight: window.innerHeight,
  };
})()`

/** Open the drawer and select a different session. Read-only. */
async function switchSession(client) {
  const before = await client.evaluate(`(() => {
    document.querySelector(${JSON.stringify(DRAWER_TOGGLE_SELECTOR)})?.click();
    return document.querySelectorAll('[class*="_sessionRow"]').length;
  })()`)
  // Wait for the rows themselves rather than a fixed sleep: the drawer mounts
  // its session list asynchronously, and reading immediately finds none.
  const rows = await waitFor('drawer session rows', 6_000, async () => {
    const count = await client.evaluate(`document.querySelectorAll('[class*="_sessionRow"]').length`)
    return count >= 2 ? count : null
  }).catch(() => null)
  if (rows === null) return { rows: before, opened: null }
  const opened = await client.evaluate(`(() => {
    const row = [...document.querySelectorAll('[class*="_sessionRow"]')]
      .filter((candidate) => candidate.querySelector('button') !== null)[1];
    if (row === undefined) return null;
    row.click();
    return (row.textContent || '').trim().slice(0, 40);
  })()`)
  return { rows, opened }
}

async function main() {
  const config = readConfig()
  const port = await allocatePort()
  const userDataDir = await mkdtemp(join(tmpdir(), 'dsh-session-focus-'))
  const chrome = spawn(config.chromePath, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank',
  ], { stdio: 'ignore' })
  let client
  try {
    client = await connect(port, config.timeoutMs)
    await client.send('Page.enable')
    await client.send('Runtime.enable')
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 2, mobile: true, hasTouch: true,
    })
    // Required before the coarse-pointer query can ever be true; maxTouchPoints
    // is rejected even while disabling, so it is only sent when enabling.
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
    await client.send('Page.navigate', { url: config.url })

    const armed = await waitFor('mobile shell', config.timeoutMs, async () => {
      try {
        return await client.evaluate(`document.querySelector(${JSON.stringify(FRAME_SELECTOR)}) !== null
          && matchMedia('(pointer: coarse)').matches`)
      } catch {
        return false
      }
    }).catch(() => null)
    if (armed === null) {
      warn('session-focus.shell', 'mobile shell never armed (frame marker + coarse pointer)')
      return
    }
    info('session-focus.shell', 'frame present, (pointer: coarse) matches')

    const before = await client.evaluate(SNAPSHOT)
    info('session-focus.before', `active=${before.activeTag ?? '-'} guarded=${before.guardedOnEditor || before.guardedOnRoot} viewport=${before.viewport ?? '-'}`)
    if (!before.docHasFocus) {
      // Say this ONCE, loudly, and let every focus reading below be discounted.
      info('session-focus.headless-focus', 'document.hasFocus() is false — headless dispatches no focus events, so editor-focused readings are NOT evidence about the blur fallback')
    }

    const switched = await switchSession(client)
    if (switched.opened === null) {
      // A single-session host cannot switch; report it rather than fake a read.
      warn('session-focus.switch', `need 2 session rows to switch, found ${switched.rows}`)
      return
    }
    info('session-focus.switch', `opened "${switched.opened}"`)

    // Race the window: read once inside it and once after it has closed. A
    // marker on the root (an early build) is reported where it was found.
    const during = await waitFor('guard window', 400, async () => {
      const snapshot = await client.evaluate(SNAPSHOT).catch(() => null)
      if (snapshot === null) return null
      return (snapshot.guardedOnEditor || snapshot.guardedOnRoot) ? snapshot : null
    }).catch(() => null)
    if (during === null) {
      warn('session-focus.guard-armed', `no marker within ${GUARD_WINDOW_MS}ms — is the effect installed?`)
    } else {
      info('session-focus.guard-armed', `on ${during.guardedOnEditor ? 'editor' : 'documentElement'}`)
      if (!during.docHasFocus) {
        // Discounted, not reported as a failure: headless sets activeElement
        // without dispatching the event the fallback listens for.
        info('session-focus.editor-focused', `inside window: ${during.editorFocused} (discounted: no focus events in headless)`)
      } else if (during.editorFocused) {
        warn('session-focus.editor-focused', 'the editor is focused inside the window — the blur fallback did not take')
      } else {
        info('session-focus.editor-focused', 'inside window: false')
      }
    }

    await sleep(GUARD_WINDOW_MS + 400)
    const after = await client.evaluate(SNAPSHOT)
    if (after.guardedOnEditor || after.guardedOnRoot) {
      warn('session-focus.window-closed', `marker still present ${GUARD_WINDOW_MS + 400}ms after the switch — the window did not lift`)
    } else {
      info('session-focus.window-closed', 'marker gone, shadow released')
    }
    info('session-focus.viewport', `before=${before.viewport ?? '-'} during=${during?.viewport ?? '-'} after=${after.viewport ?? '-'}`)
    if (before.viewport !== null && after.viewport !== null && before.viewport !== after.viewport) {
      // Headless has no IME, so a real collapse here is unexpected — but it is
      // a reading, not a verdict.
      warn('session-focus.viewport', 'the visual viewport moved without a synthesized keyboard — investigate')
    }
    console.log('INFO session-focus.verdict', 'DOM half only. Confirm the keyboard on a device: switch with it down (stays down), then tap the composer (opens on that tap).')
  } finally {
    if (client !== undefined) client.close()
    chrome.kill('SIGKILL')
    await rm(userDataDir, { recursive: true, force: true }).catch(() => { /* best effort */ })
  }
}

try {
  await main()
} catch (error) {
  warn('session-focus.probe', error instanceof Error ? error.message : String(error))
}

const failures = results.filter((row) => row.status === 'WARN').length
console.log(`session-focus probe: ${results.filter((row) => row.status === 'INFO').length} readings, ${failures} warning(s) — INFO probe, never a gate`)

// CDP probe for the drawer panel-row close and the content font-size axis
// (dsh-maestro-mobile).
//
// Both checks are written to FAIL on the pre-fix code, so a green run is
// evidence rather than a tautology:
//   - panel-row: on the old plugin the drawer stayed open when a global panel
//     row was tapped; the probe opens the drawer, taps a real panel row and
//     asserts the drawer actually collapsed.
//   - font-axis: on the old plugin the message rule carried `15px!important`,
//     which beats the host variable. The probe sets --dsh-content-font-size on
//     <body> to a value ABOVE the floor and asserts the COMPUTED font-size of
//     real message prose changes. A grep for the variable would not prove the
//     setting reaches the text; only the computed value does.
//
// Env: DSH_PROBE_URL (default http://127.0.0.1:3080/),
//      DSH_PROBE_SESSION_ID (required), DSH_PROBE_CHROME (default /opt/google/chrome/chrome),
//      DSH_PROBE_TIMEOUT_MS (default 30000).
// Exits 0 only when every check passes.
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import net from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DEFAULT_URL = 'http://127.0.0.1:3080/'
const DEFAULT_CHROME = '/opt/google/chrome/chrome'
const DEFAULT_TIMEOUT_MS = 30_000
const FRAME_SELECTOR = '[data-mobile-nav="frame"]'
const PANEL_ROW_SELECTOR = 'nav[aria-label] button[class*="panelRow"]'

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

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms))

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

const drawerOpen = (client) => client.evaluate(`(() => {
  const frame = document.querySelector(${JSON.stringify(FRAME_SELECTOR)});
  return frame !== null && !frame.hasAttribute('data-sidebar-collapsed');
})()`)

async function main() {
  const url = process.env.DSH_PROBE_URL || DEFAULT_URL
  const sessionId = process.env.DSH_PROBE_SESSION_ID?.trim()
  if (!sessionId) throw new Error('DSH_PROBE_SESSION_ID is required')
  const timeoutMs = Number(process.env.DSH_PROBE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)

  const port = await allocatePort()
  const profileDir = await mkdtemp(join(homedir(), '.cache', 'dsh-mobile-panel-font-'))
  const chrome = spawn(process.env.DSH_PROBE_CHROME || DEFAULT_CHROME, [
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

    // Phone profile + touch emulation: without the latter headless reports
    // (pointer: none) and the whole mobile branch stays dormant.
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 2, mobile: true, hasTouch: true,
    })
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
    await client.send('Page.navigate', { url })
    await waitFor('mobile branch arm', timeoutMs, async () => {
      try {
        const coarse = await client.evaluate(`matchMedia('(pointer: coarse)').matches`)
        const frame = await client.evaluate(`document.querySelector(${JSON.stringify(FRAME_SELECTOR)}) !== null`)
        return coarse && frame
      } catch {
        return false
      }
    })
    pass('setup.mobile-armed', 'coarse=true frame=true')

    // ---------------------------------------------------------------- fix A
    // Ensure the drawer is open, then tap a REAL panel row through the DOM
    // click path the plugin's capture listener observes.
    const state = await client.evaluate(`(() => {
      const frame = document.querySelector(${JSON.stringify(FRAME_SELECTOR)});
      const open = frame !== null && !frame.hasAttribute('data-sidebar-collapsed');
      const rows = document.querySelectorAll(${JSON.stringify(PANEL_ROW_SELECTOR)});
      return { open, rows: rows.length, firstLabel: rows[0]?.getAttribute('aria-label') ?? null };
    })()`)
    if (!state.open) {
      await client.evaluate(`document.querySelector('[data-mobile-nav="fab"], [data-mobile-nav="toggle"]')?.click()`)
      await waitFor('drawer open', timeoutMs, () => drawerOpen(client))
    }
    if (state.rows === 0) {
      fail('panel-close.row-present', 'no sidebar panel row on this host/state')
    } else {
      pass('panel-close.row-present', `rows=${state.rows} first=${state.firstLabel}`)
      // The predicate under test: the drawer must be open right before the tap.
      const beforeTap = await drawerOpen(client)
      if (!beforeTap) fail('panel-close.precondition', 'drawer not open before the tap')
      else pass('panel-close.precondition', 'drawer open')

      // Re-resolve the row INSIDE the page after the drawer is open.
      const tapped = await client.evaluate(`(() => {
        const row = document.querySelector(${JSON.stringify(PANEL_ROW_SELECTOR)});
        if (row === null) return 'missing';
        row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        return 'tapped';
      })()`)
      if (tapped !== 'tapped') fail('panel-close.tap', tapped)
      else {
        const closed = await waitFor('drawer collapse after panel tap', 4000, async () =>
          (await drawerOpen(client)) === false).catch(() => false)
        if (closed) pass('panel-close.drawer-collapsed', 'drawer collapsed on panel row tap')
        else fail('panel-close.drawer-collapsed', 'drawer STILL OPEN after tapping a panel row')
      }
    }

    // ---------------------------------------------------------------- fix B
    // Open a session so real message prose exists, then raise the host axis
    // above the floor and read the COMPUTED size of the prose.
    await client.evaluate(`document.querySelector('[data-mobile-nav="fab"], [data-mobile-nav="toggle"]')?.click()`)
    await sleep(500)

    const axis = await client.evaluate(`(() => {
      const probe = document.createElement('span');
      // A synthetic message-like node is not enough: we need the real rule to
      // match, so measure an element the plugin's selector actually targets.
      const body = document.body;
      const set = (value) => body.style.setProperty('--dsh-content-font-size', value);
      set('14px');
      const p = document.querySelector('[data-phase] p, [data-phase] [class*="_text_"], [data-phase] li');
      const computedBefore = p === null ? null : getComputedStyle(p).fontSize;
      set('22px');
      const computedAfter = p === null ? null : getComputedStyle(p).fontSize;
      body.style.removeProperty('--dsh-content-font-size');
      return {
        hasProse: p !== null,
        element: p === null ? null : (p.className || p.tagName),
        computedBefore,
        computedAfter,
      };
    })()`)

    if (!axis.hasProse) {
      fail('font-axis.prose-present', 'no message prose found to measure')
    } else {
      pass('font-axis.prose-present', `${axis.element}`)
      const before = Number.parseFloat(axis.computedBefore)
      const after = Number.parseFloat(axis.computedAfter)
      if (after > before) {
        pass('font-axis.follows-setting', `${axis.computedBefore} -> ${axis.computedAfter}`)
      } else {
        fail('font-axis.follows-setting', `axis ignored: ${axis.computedBefore} -> ${axis.computedAfter}`)
      }
      // The floor must hold: a setting BELOW it must not shrink prose.
      const floored = await client.evaluate(`(() => {
        const body = document.body;
        body.style.setProperty('--dsh-content-font-size', '8px');
        const p = document.querySelector('[data-phase] p, [data-phase] [class*="_text_"], [data-phase] li');
        const size = p === null ? null : getComputedStyle(p).fontSize;
        body.style.removeProperty('--dsh-content-font-size');
        return size;
      })()`)
      const floorValue = Number.parseFloat(floored)
      if (floorValue >= 15) pass('font-axis.floor-holds', `${floored} >= 15px`)
      else fail('font-axis.floor-holds', `prose shrank below the floor: ${floored}`)
    }
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

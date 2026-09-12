// CDP probe for the drawer-swipe yield rules (dsh-maestro-mobile).
//
// Verifies, on a real page with touch emulation, that the left-edge swipe
// opens the drawer in the control case and yields to:
//   - an open conversation overlay ([data-conversation-composer-overlay]),
//   - a live text selection (a textarea's own selectionStart/End),
//   - a two-finger pinch (no drawer, and no prevented touchmove).
//
// Env: DSH_PROBE_URL (default http://127.0.0.1:3080/),
//      DSH_PROBE_SESSION_ID (required), DSH_PROBE_CHROME (default chromium),
//      DSH_PROBE_TIMEOUT_MS (default 30000).
// Exits 0 only when every scenario passes.
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import net from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DEFAULT_URL = 'http://127.0.0.1:3080/'
const DEFAULT_TIMEOUT_MS = 30_000
const CHROME_GRACE_MS = 5_000
const FRAME_SELECTOR = '[data-mobile-nav="frame"]'
const OVERLAY_SELECTOR = '[data-conversation-composer-overlay]'
const MOBILE_STYLE_SELECTOR = 'style[data-plugin="@ddtcorex/dsh-maestro-mobile"]'

const results = []
const pass = (name, detail = '') => results.push({ status: 'PASS', name, detail })
const fail = (name, detail = '') => results.push({ status: 'FAIL', name, detail })

function readConfig(env = process.env) {
  const sessionId = env.DSH_PROBE_SESSION_ID?.trim()
  if (!sessionId) throw new Error('DSH_PROBE_SESSION_ID is required')
  const parsedUrl = new URL(env.DSH_PROBE_URL || DEFAULT_URL)
  const timeoutMs = Number(env.DSH_PROBE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('DSH_PROBE_TIMEOUT_MS must be a positive integer')
  }
  return { url: parsedUrl, sessionId, chromePath: env.DSH_PROBE_CHROME || 'chromium', timeoutMs }
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
    await sleep(100)
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
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++messageId
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  return { send, evaluate, close: () => { try { ws.close() } catch { /* best effort */ } } }
}

async function drawerOpen(client) {
  return client.evaluate(`(() => {
    const frame = document.querySelector(${JSON.stringify(FRAME_SELECTOR)});
    return frame !== null && !frame.hasAttribute('data-sidebar-collapsed');
  })()`)
}

async function setDrawer(client, open) {
  if ((await drawerOpen(client)) === open) return true
  // Close via the backdrop (the control the shell itself exposes while open);
  // the FAB is only mounted in the closed state, so it cannot close.
  await client.evaluate(`(() => {
    const backdrop = document.querySelector('[data-mobile-nav="backdrop"]');
    if (backdrop !== null) { backdrop.click(); return 'backdrop'; }
    const control = document.querySelector('[data-mobile-nav="fab"], [data-mobile-nav="toggle"]');
    if (control !== null) { control.click(); return 'control'; }
    return 'none';
  })()`)
  const deadline = Date.now() + 4_000
  while (Date.now() < deadline) {
    if ((await drawerOpen(client)) === open) {
      // Let the swipe layer's commit cooldown lapse so the next stroke is not
      // swallowed by onCooldown().
      await sleep(500)
      return true
    }
    await sleep(100)
  }
  return false
}

async function touchSwipe(client, points, { steps = 6, holdMs = 16 } = {}) {
  const [start] = points
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: points.map((point) => ({ x: point.x, y: point.y })),
  })
  const last = points[points.length - 1]
  for (let step = 1; step <= steps; step += 1) {
    const ratio = step / steps
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: points.map((point) => ({
        x: Math.round(point.x + (point.toX - point.x) * ratio),
        y: Math.round(point.y + (point.toY - point.y) * ratio),
      })),
    })
    await sleep(holdMs)
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  return { start, last }
}

/** Swipe right from the left edge across ~55% of the viewport. */
async function edgeSwipeOpen(client, width) {
  await touchSwipe(client, [{ x: 12, y: 420, toX: Math.round(width * 0.7), toY: 420 }])
  await sleep(700)
}

async function installTouchMoveRecorder(client) {
  await client.evaluate(`(() => {
    window.__probeTouchMoves = [];
    if (window.__probeTouchMoveListener) return true;
    window.__probeTouchMoveListener = (event) => {
      window.__probeTouchMoves.push({ touches: event.touches.length, prevented: event.defaultPrevented });
    };
    document.addEventListener('touchmove', window.__probeTouchMoveListener, { passive: true });
    return true;
  })()`)
}

async function resetScenario(client) {
  await client.evaluate(`(() => {
    document.getElementById('probe-yield-host')?.remove();
    window.getSelection()?.removeAllRanges();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    return true;
  })()`)
  const closed = await setDrawer(client, false)
  if (!closed) fail('swipe.reset', 'drawer could not be closed before the scenario')
  return closed
}

async function main() {
  const config = readConfig()
  const port = await allocatePort()
  const profileDir = await mkdtemp(join(homedir(), '.cache', 'dsh-maestro-mobile-swipe-'))
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
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 2, mobile: true, hasTouch: true,
    })
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `localStorage.setItem('dsh.sessions.current', ${JSON.stringify(JSON.stringify({ sessionId: config.sessionId }))})`,
    })
    await client.send('Page.navigate', { url: config.url.href })

    await waitFor('mobile plugin boot', config.timeoutMs, async () => {
      try {
        return await client.evaluate(`document.querySelector(${JSON.stringify(MOBILE_STYLE_SELECTOR)}) !== null
          && document.querySelector(${JSON.stringify(FRAME_SELECTOR)}) !== null
          && matchMedia('(pointer: coarse)').matches`)
      } catch {
        return false
      }
    })
    const width = await client.evaluate('window.innerWidth')
    await installTouchMoveRecorder(client)

    // Control: a left-edge swipe opens the drawer. Without this the other
    // scenarios could pass by doing nothing at all.
    await setDrawer(client, false)
    await edgeSwipeOpen(client, width)
    if (await drawerOpen(client)) pass('swipe.control-open', 'drawer opened')
    else fail('swipe.control-open', 'left-edge swipe did not open the drawer')

    // Overlay takeover: the generic conversation.view overlay attribute must
    // yield the stroke so horizontal content panning wins.
    await resetScenario(client)
    await client.evaluate(`(() => {
      const host = document.createElement('div');
      host.id = 'probe-yield-host';
      host.setAttribute('data-conversation-composer-overlay', '');
      host.style.cssText = 'position:fixed;left:0;top:300px;width:200px;height:200px;z-index:9999';
      document.body.appendChild(host);
      return true;
    })()`)
    const overlayPresent = await client.evaluate(`document.querySelector(${JSON.stringify(OVERLAY_SELECTOR)}) !== null`)
    const overlayBefore = await drawerOpen(client)
    await edgeSwipeOpen(client, width)
    const overlayAfter = await drawerOpen(client)
    if (overlayAfter) fail('swipe.overlay-yields', `drawer opened (present=${overlayPresent} before=${overlayBefore} after=${overlayAfter})`)
    else pass('swipe.overlay-yields', `drawer stayed closed (present=${overlayPresent} before=${overlayBefore})`)

    // Selection ownership: a live textarea selection must own the stroke.
    await resetScenario(client)
    await client.evaluate(`(() => {
      const host = document.createElement('div');
      host.id = 'probe-yield-host';
      host.style.cssText = 'position:fixed;left:0;top:300px;width:220px;height:160px;z-index:9999';
      const field = document.createElement('textarea');
      field.value = 'selection handle drag';
      field.style.cssText = 'width:100%;height:100%;font-size:14px';
      host.appendChild(field);
      document.body.appendChild(host);
      field.focus();
      field.setSelectionRange(0, 9);
      return document.activeElement === field;
    })()`)
    const selectionBefore = await drawerOpen(client)
    await edgeSwipeOpen(client, width)
    const selectionKept = await client.evaluate(`(() => {
      const field = document.querySelector('#probe-yield-host textarea');
      return field !== null && field.selectionStart === 0 && field.selectionEnd === 9;
    })()`)
    const selectionAfter = await drawerOpen(client)
    if (selectionAfter) fail('swipe.selection-yields', `drawer opened (before=${selectionBefore} after=${selectionAfter})`)
    else if (!selectionKept) fail('swipe.selection-yields', 'selection collapsed despite the yield')
    else pass('swipe.selection-yields', `drawer stayed closed (before=${selectionBefore}), selection intact`)

    // Pinch: two fingers inside the start zone must not open the drawer and
    // must not have their touchmoves prevented.
    await resetScenario(client)
    await client.evaluate('window.__probeTouchMoves = []')
    await touchSwipe(client, [
      { x: 24, y: 400, toX: 8, toY: 400 },
      { x: 96, y: 400, toX: 150, toY: 400 },
    ], { steps: 5 })
    await sleep(600)
    const pinch = await client.evaluate(`(() => ({
      moved: window.__probeTouchMoves.length,
      prevented: window.__probeTouchMoves.filter((entry) => entry.prevented).length,
    }))()`)
    if (await drawerOpen(client)) fail('swipe.pinch-yields', `two-finger gesture opened the drawer (moved=${pinch.moved}, prevented=${pinch.prevented})`)
    else if (pinch.prevented > 0) fail('swipe.pinch-yields', `${pinch.prevented}/${pinch.moved} touchmoves were prevented`)
    else pass('swipe.pinch-yields', `touchmoves=${pinch.moved} prevented=0`)
  } finally {
    client?.close()
    chrome.kill('SIGKILL')
    await sleep(CHROME_GRACE_MS > 300 ? 300 : 0)
    await rm(profileDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  }

  for (const result of results) {
    console.log(`${result.status} ${result.name}${result.detail ? ` ${result.detail}` : ''}`)
  }
  const failures = results.filter((result) => result.status === 'FAIL').length
  console.log(`SUMMARY pass=${results.length - failures} fail=${failures}`)
  process.exitCode = failures > 0 ? 1 : 0
}

await main()

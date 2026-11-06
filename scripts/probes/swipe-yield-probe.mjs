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
/** Post-hydration settle before the first stroke. The host's own layout
 *  effects (selectPanel → narrowExpanded = false on a viewport < 768) run for
 *  roughly the first second after load and would close a drawer the first
 *  stroke just opened; the probe therefore starts on a settled app. */
const BOOT_SETTLE_MS = 1_500
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

/**
 * Drive one stroke with synthetic PointerEvents dispatched from the page. The
 * gesture layer listens on `document` (capture), so a dispatch on the element
 * under the finger reaches it exactly like a real touch would, but the
 * sequence is scripted: it lets a scenario END the stroke in `pointercancel`,
 * the browser taking the gesture away, which no CDP input recipe can produce
 * on demand.
 * @param client - CDP client.
 * @param stroke - start x/y, the move xs to deliver, and how to end.
 * @returns 'ok', or the reason the dispatch could not run.
 */
async function syntheticStrokePart(client, type, x) {
  return client.evaluate(`(() => {
    const target = document.elementFromPoint(${x}, 420) || document.body;
    target.dispatchEvent(new PointerEvent(${JSON.stringify(type)}, {
      bubbles: true, cancelable: true, composed: true,
      pointerId: 91, pointerType: 'touch', isPrimary: true,
      clientX: ${x}, clientY: 420, buttons: 1,
    }));
    return 'ok';
  })()`)
}

async function syntheticStroke(client, stroke) {
  // One event per round trip, with a real gap between them: the classifier's
  // velocity window reads the event timestamps, and events dispatched inside
  // one task are microseconds apart, which reads as an infinite fling.
  const dispatch = (type, x) => client.evaluate(`(() => {
    // Re-hit-test every point, like a real finger: the arm flips the drawer
    // open and React re-renders, so the node under the finger at pointerdown
    // can be detached by the next event, and a detached target never reaches
    // the document-level capture listeners the gesture layer installs on.
    const target = document.elementFromPoint(${x}, ${stroke.y}) || document.body;
    if (target === null) return 'no-target';
    target.dispatchEvent(new PointerEvent(${JSON.stringify(type)}, {
      bubbles: true, cancelable: true, composed: true,
      pointerId: 91, pointerType: 'touch', isPrimary: true,
      clientX: ${x}, clientY: ${stroke.y}, buttons: 1,
    }));
    return 'ok';
  })()`)
  if ((await dispatch('pointerdown', stroke.x)) !== 'ok') return 'no-target'
  for (const x of stroke.moves) {
    await sleep(stroke.gapMs ?? 16)
    await dispatch('pointermove', x)
  }
  await sleep(stroke.gapMs ?? 16)
  return dispatch(stroke.end, stroke.endX)
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
    // Boot readiness is not enough on its own: during hydration the host runs
    // its own layout effects, and `selectPanel()` sets narrowExpanded = false
    // (dsh-client-ui-layout) whenever a main panel settles, which closes the
    // drawer a swipe has just opened. Measured 2026-11-06 on 0.2.2-rc.1: the
    // first stroke after load flipped the drawer open at the 8px arm and the
    // host collapsed it again ~250ms later, with no plugin handler involved
    // (the gesture layer had only called toggleSidebar once, at arm time).
    await waitFor('app painted', config.timeoutMs, async () => {
      try {
        return await client.evaluate(`(() => {
          if (document.querySelector('[data-sidebar-toggle]') === null) return false
          const column = document.querySelector('[data-mobile-nav="frame"] > [class*="_sidebarCol"]')
          return column !== null && column.getBoundingClientRect().height > 0
        })()`)
      } catch {
        return false
      }
    })
    // The app never stops mutating (a 2s sample: 122 records, longest quiet
    // gap 86ms), so "wait for idle" is not available; a bounded settle is.
    await sleep(BOOT_SETTLE_MS)
    const width = await client.evaluate('window.innerWidth')
    await installTouchMoveRecorder(client)

    // Control: a left-edge swipe opens the drawer. Without this the other
    // scenarios could pass by doing nothing at all.
    await setDrawer(client, false)
    await edgeSwipeOpen(client, width)
    if (await drawerOpen(client)) pass('swipe.control-open', 'drawer opened')
    else fail('swipe.control-open', 'left-edge swipe did not open the drawer')

    // The follow must move the DRAWER, not the host's dimming layer. DSH 0.2.2
    // renders `div[data-sidebar-mask]` as the frame's first element child, so
    // a first-child drawer lookup bound the follow transform to that empty
    // div: the real drawer jumped to its resting position at the 8px arm and
    // never tracked the finger.
    await resetScenario(client)
    await syntheticStroke(client, { x: 12, y: 420, moves: [72], end: 'pointerup', endX: 72 })
    // (the stroke above already ended; the geometry read below repeats it)
    await setDrawer(client, false)
    await sleep(600)
    await syntheticStrokePart(client, 'pointerdown', 12)
    await sleep(16)
    await syntheticStrokePart(client, 'pointermove', 72)
    const followGeom = await client.evaluate(`(() => {
      const frame = document.querySelector(${JSON.stringify(FRAME_SELECTOR)});
      const drawer = frame === null ? null : frame.querySelector(':scope > [class*="_sidebarCol"]');
      const mask = frame === null ? null : frame.querySelector(':scope > [data-sidebar-mask]');
      const read = (el) => {
        if (el === null) return null;
        const matrix = getComputedStyle(el).transform;
        if (matrix === 'none') return 0;
        const parts = matrix.match(/matrix\(([^)]+)\)/);
        return parts === null ? null : Math.round(Number(parts[1].split(',')[4]));
      };
      return { drawer: read(drawer), mask: read(mask), collapsed: frame.hasAttribute('data-sidebar-collapsed') };
    })()`)
    await syntheticStrokePart(client, 'pointerup', 72)
    await sleep(400)
    if (followGeom.drawer === null) fail('swipe.open-follow-targets-drawer', 'the drawer was not found')
    else if (!(followGeom.drawer < -20)) {
      fail('swipe.open-follow-targets-drawer', `the drawer did not follow the finger (tx=${followGeom.drawer}, mask tx=${followGeom.mask})`)
    } else pass('swipe.open-follow-targets-drawer', `drawer followed at tx=${followGeom.drawer}`)

    // A stroke the browser takes away: pointercancel carries no coordinates,
    // so the verdict comes from the last observed sample. Before this rule the
    // armed drawer was reverted unconditionally, which is the phone report
    // "the sidebar opens and immediately closes".
    await resetScenario(client)
    const cancelFar = await syntheticStroke(client, { x: 12, y: 420, moves: [60, 108, 156, 204], end: 'pointercancel', endX: 204 })
    await sleep(600)
    if (cancelFar !== 'ok') fail('swipe.cancel-keeps-open', `stroke dispatch failed: ${cancelFar}`)
    else if (await drawerOpen(client)) pass('swipe.cancel-keeps-open', 'a cancelled swipe stayed open')
    else fail('swipe.cancel-keeps-open', 'the drawer closed itself after a cancelled swipe')

    // ... and a cancelled twitch still springs back: the classifier, not the
    // cancel event itself, owns the verdict.
    await setDrawer(client, false)
    await sleep(600)
    // Slow and short: 8px every 40ms is 0.2px/ms, below the 0.45 fling
    // threshold, and 18px is far below the 0.16 x 390 = 62px open distance.
    const cancelNear = await syntheticStroke(client, { x: 12, y: 420, moves: [14, 22, 30], end: 'pointercancel', endX: 30, gapMs: 40 })
    await sleep(600)
    if (cancelNear !== 'ok') fail('swipe.cancel-twitch-reverts', `stroke dispatch failed: ${cancelNear}`)
    else if (await drawerOpen(client)) fail('swipe.cancel-twitch-reverts', 'a 36px cancelled twitch left the drawer open')
    else pass('swipe.cancel-twitch-reverts', 'a cancelled twitch sprang back')

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

    // Drag cooperation mark: a component that marks itself while dragging must
    // keep the drawer from arming for the whole stroke.
    await resetScenario(client)
    await client.evaluate(`(() => {
      const host = document.createElement('div');
      host.id = 'probe-yield-host';
      host.setAttribute('data-mobile-nav-dragging', '');
      host.style.cssText = 'position:fixed;left:0;top:380px;width:120px;height:120px;z-index:9999';
      document.body.appendChild(host);
      return true;
    })()`)
    const markBefore = await drawerOpen(client)
    await edgeSwipeOpen(client, width)
    const markAfter = await drawerOpen(client)
    if (markAfter) fail('swipe.drag-mark-yields', `drawer opened (before=${markBefore} after=${markAfter})`)
    else pass('swipe.drag-mark-yields', `drawer stayed closed (before=${markBefore})`)

    // Floating-widget heuristic: a small freely-positioned layer with no mark
    // still yields, because the user pressed the widget itself.
    await resetScenario(client)
    await client.evaluate(`(() => {
      const host = document.createElement('div');
      host.id = 'probe-yield-host';
      host.style.cssText = 'position:fixed;left:0;top:380px;width:80px;height:80px;z-index:9999';
      document.body.appendChild(host);
      return true;
    })()`)
    const widgetBefore = await drawerOpen(client)
    await edgeSwipeOpen(client, width)
    const widgetAfter = await drawerOpen(client)
    if (widgetAfter) fail('swipe.floating-widget-yields', `drawer opened (before=${widgetBefore} after=${widgetAfter})`)
    else pass('swipe.floating-widget-yields', `drawer stayed closed (before=${widgetBefore})`)

    // Overlay option list: a body-portalled menu that overlaps the start zone
    // owns the pointers on it. The composer model picker is the reported case —
    // its rows span x=84..324 on a 390px phone, so their left third sits inside
    // the 45% zone; without this yield a row tap whose finger drifts past
    // LOCK_PX arms the drawer open and the release consumes the tap, so the row
    // reads as dead ("the model list appears but choosing one does nothing").
    //
    // The probe host is deliberately 220px TALL: above FLOATING_WIDGET_MAX_PX,
    // so it cannot pass through the floating-widget heuristic and the scenario
    // only goes green on the overlay-menu yield itself.
    await resetScenario(client)
    await client.evaluate(`(() => {
      const host = document.createElement('div');
      host.id = 'probe-yield-host';
      host.setAttribute('role', 'menu');
      host.style.cssText = 'position:fixed;left:0;top:300px;width:200px;height:220px;z-index:9999';
      document.body.appendChild(host);
      return true;
    })()`)
    // Precondition: the probe menu must actually own the swipe's start point,
    // or the scenario would pass by swiping at nothing.
    const menuOwnsStart = await client.evaluate(`(() => {
      const hit = document.elementFromPoint(12, 420);
      const host = document.getElementById('probe-yield-host');
      return hit !== null && host !== null && (hit === host || host.contains(hit));
    })()`)
    if (!menuOwnsStart) fail('swipe.overlay-menu-yields', 'precondition: the probe menu does not own the swipe start point')
    else {
      const menuBefore = await drawerOpen(client)
      await touchSwipe(client, [{ x: 12, y: 420, toX: Math.round(width * 0.7), toY: 420 }])
      await sleep(700)
      const menuAfter = await drawerOpen(client)
      if (menuAfter) fail('swipe.overlay-menu-yields', `drawer opened (before=${menuBefore} after=${menuAfter})`)
      else pass('swipe.overlay-menu-yields', `drawer stayed closed (before=${menuBefore})`)
    }

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

// CDP probe for the drawer backdrop fade (dsh-maestro-mobile).
//
// The backdrop belongs to the shell.overlay slot and is mounted only while the
// drawer is open; the host flips data-sidebar-collapsed when the close animation
// lands, and React unmounts the layer then. Without a fade the dimming snaps away
// ~280ms after the drawer already left ("drawer, then dark"), which is why
// sidebar-swipe.ts fades it from its own close commit (backdrop-fade.ts).
//
// The rows below drive a real swipe-close and sample the layer every frame:
//  - it must be mid-fade while the drawer is still sliding (a partial opacity,
//    not a jump to 0 and not a straight 1),
//  - it must be gone once the commit lands,
//  - and a non-animated close (the backdrop's own tap) must still close the
//    drawer and leave nothing behind.
//
// Env: DSH_PROBE_URL (default http://127.0.0.1:3082/),
//      DSH_PROBE_SESSION_ID (required), DSH_PROBE_CHROME (default chromium),
//      DSH_PROBE_TIMEOUT_MS (default 30000).
// Exits 0 only when every row passes.
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import net from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DEFAULT_URL = 'http://127.0.0.1:3082/'
const DEFAULT_TIMEOUT_MS = 30_000
const FRAME_SELECTOR = '[data-mobile-nav="frame"]'
const BACKDROP_SELECTOR = '[data-mobile-nav="backdrop"]'

const results = []
const pass = (name, detail = '') => {
  results.push({ status: 'PASS', name, detail })
  console.log(`PASS ${name}${detail ? ` ${detail}` : ''}`)
}
const fail = (name, detail = '') => {
  results.push({ status: 'FAIL', name, detail })
  console.log(`FAIL ${name}${detail ? ` ${detail}` : ''}`)
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

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms))

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

/** Drawer open state, read from the frame marker the host owns. */
const drawerOpen = (client) => client.evaluate(`(() => {
  const frame = document.querySelector(${JSON.stringify(FRAME_SELECTOR)});
  return frame !== null && !frame.hasAttribute('data-sidebar-collapsed');
})()`)

/** Open (or close) the drawer through the plugin's own controls. */
async function setDrawer(client, open) {
  // Already there: clicking the backdrop would toggle the OTHER way.
  if ((await drawerOpen(client)) === open) return true
  await client.evaluate(`(() => {
    const backdrop = document.querySelector(${JSON.stringify(BACKDROP_SELECTOR)});
    if (backdrop !== null) { backdrop.click(); return 'backdrop'; }
    const control = document.querySelector('[data-mobile-nav="fab"], [data-mobile-nav="toggle"]');
    if (control !== null) { control.click(); return 'control'; }
    return 'none';
  })()`)
  const deadline = Date.now() + 4_000
  while (Date.now() < deadline) {
    if ((await drawerOpen(client)) === open) {
      // Let the swipe layer's commit cooldown lapse so a stroke is not swallowed.
      await sleep(500)
      return true
    }
    await sleep(100)
  }
  return false
}

async function touchSwipe(client, points, { steps = 6, holdMs = 16 } = {}) {
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: points.map((point) => ({ x: point.x, y: point.y })),
  })
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
}

/** Sample the backdrop every frame for `ms`, in the page (no CDP jitter). */
const startSampling = (client, ms) => client.evaluate(`(() => {
  window.__fadeSamples = [];
  const started = performance.now();
  const frame = document.querySelector(${JSON.stringify(FRAME_SELECTOR)});
  const drawer = frame === null ? null : frame.firstElementChild;
  // Identity of the sampled node: React unmounts the backdrop with the drawer, so
  // a second id in one close window means the layer was REPLACED - and any inline
  // fade written to the old node died with it.
  const ids = new WeakMap();
  let nextId = 0;
  const idOf = (node) => {
    if (node === null) return null;
    if (!ids.has(node)) ids.set(node, ++nextId);
    return ids.get(node);
  };
  const tick = () => {
    const el = document.querySelector(${JSON.stringify(BACKDROP_SELECTOR)});
    window.__fadeSamples.push({
      t: Math.round(performance.now() - started),
      node: idOf(el),
      mounted: el !== null,
      opacity: el === null ? null : Number(getComputedStyle(el).opacity),
      // Which close path ran: the animated commit writes inline transition +
      // transform on the drawer and the fade on the layer; an immediate flip
      // writes neither.
      backdropInline: el === null ? null : el.style.cssText.slice(0, 60),
      drawerTx: drawer === null ? null : drawer.style.transform,
      drawerTransition: drawer === null ? null : drawer.style.transition,
      collapsed: frame === null ? null : frame.hasAttribute('data-sidebar-collapsed'),
    });
    if (performance.now() - started < ${ms}) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return true;
})()`)

const readSamples = (client) => client.evaluate('window.__fadeSamples')

async function main() {
  const url = process.env.DSH_PROBE_URL || DEFAULT_URL
  const sessionId = process.env.DSH_PROBE_SESSION_ID?.trim()
  if (!sessionId) throw new Error('DSH_PROBE_SESSION_ID is required')
  const timeoutMs = Number(process.env.DSH_PROBE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
  const port = await allocatePort()
  const profileDir = await mkdtemp(join(homedir(), '.cache', 'dsh-mobile-fade-'))
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

    await waitFor('mobile shell', timeoutMs, async () => {
      try {
        return await client.evaluate(`matchMedia('(pointer: coarse)').matches && document.querySelector(${JSON.stringify(FRAME_SELECTOR)}) !== null`)
      } catch {
        return false
      }
    })
    // A live session (any phase) is enough: the shell chrome is what matters.
    await waitFor('any phase', timeoutMs, async () => {
      try {
        return await client.evaluate(`document.querySelector('[data-phase]') !== null`)
      } catch {
        return false
      }
    })

    // --- the drawer can be open at all -------------------------------------
    if (!await setDrawer(client, true)) {
      fail('fade.drawer-opens', 'the drawer could not be opened')
    } else {
      const opened = await client.evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(BACKDROP_SELECTOR)});
        return { mounted: el !== null, opacity: el === null ? null : Number(getComputedStyle(el).opacity) };
      })()`)
      if (opened.mounted && opened.opacity > 0.9) pass('fade.drawer-opens', `backdrop mounted at opacity ${opened.opacity}`)
      else fail('fade.drawer-opens', JSON.stringify(opened))
    }

    // --- a swipe-close fades the layer while the drawer slides -------------
    const width = await client.evaluate('innerWidth')
    // The swipe layer moves the plugin frame's first child (sidebar-swipe's own
    // findDrawer), not a marker of its own.
    const drawerWidth = await client.evaluate(`(() => {
      const frame = document.querySelector(${JSON.stringify(FRAME_SELECTOR)});
      const drawer = frame === null ? null : frame.firstElementChild;
      return drawer === null ? 0 : Math.round(drawer.getBoundingClientRect().width);
    })()`)
    if (drawerWidth <= 0) {
      fail('fade.starts-with-the-slide', 'no drawer element to stroke')
      fail('fade.lands-with-the-drawer', 'no drawer element to stroke')
    } else {
      // The window must cover the STROKE (a CDP-driven swipe costs ~400ms of
      // round trips in headless), the commit's 280ms animation, and the flip that
      // unmounts the layer 40ms after it - a shorter window stops sampling
      // mid-fade and reads as "the fade never finished".
      await startSampling(client, 2000)
      // Start inside the drawer and drag well past the 13% close distance.
      const from = Math.round(drawerWidth - 20)
      await touchSwipe(client, [{ x: from, y: 420, toX: Math.round(width * 0.15), toY: 420 }])
      await sleep(900)
      const samples = await readSamples(client)
      // The whole window, not just its first frames: the fade starts at the END
      // of the stroke (the commit), so its partial frames live ~150-500ms in.
      const mounted = samples.filter((sample) => sample.mounted === true)
      const partial = mounted.filter((sample) => sample.opacity > 0.05 && sample.opacity < 0.95)
      const minOpacity = mounted.reduce((min, sample) => Math.min(min, sample.opacity), 1)
      const trace = (sample) => `${sample.t}ms:${sample.opacity}/tx=${sample.drawerTx === null || sample.drawerTx === '' ? '-' : 'set'}/inl=${sample.backdropInline === null || sample.backdropInline === '' ? '-' : sample.backdropInline}`
      if (partial.length === 0) {
        const nodes = [...new Set(mounted.map((sample) => sample.node))].join(',')
        fail('fade.starts-with-the-slide', `no partial frame in ${mounted.length} mounted frames (nodes ${nodes}) :: ${mounted.slice(-8).map((sample) => `${sample.t}:${sample.opacity}@${sample.node}${sample.backdropInline === null || sample.backdropInline === '' ? '' : ' inl'}`).join(' | ')}`)
      } else if (minOpacity > 0.2) {
        const commit = samples.findIndex((sample) => sample.drawerTransition !== null && sample.drawerTransition !== '')
        const tail = samples.slice(Math.max(0, commit - 1), commit + 12)
          .map((sample) => `${sample.t}:${sample.opacity ?? 'gone'}@${sample.node ?? '-'}${sample.collapsed === true ? '/collapsed' : ''}`).join(' ')
        fail('fade.starts-with-the-slide', `the fade did not finish before the layer left (min ${minOpacity}, ${partial.length} partial frames) :: ${tail}`)
      } else {
        pass('fade.starts-with-the-slide', `${partial.length} partial frames of ${mounted.length}, min ${minOpacity}`)
      }
      await sleep(500)
      const closed = await drawerOpen(client)
      const stillMounted = await client.evaluate(`document.querySelector(${JSON.stringify(BACKDROP_SELECTOR)}) !== null`)
      if (!closed && !stillMounted) pass('fade.lands-with-the-drawer', 'drawer closed and the layer is gone')
      else fail('fade.lands-with-the-drawer', `open=${closed} mounted=${stillMounted}`)
    }

    // --- a non-animated close still works ---------------------------------
    if (!await setDrawer(client, true)) {
      fail('fade.flat-close-untouched', 'the drawer could not be re-opened')
    } else {
      await client.evaluate(`document.querySelector(${JSON.stringify(BACKDROP_SELECTOR)})?.click()`)
      const flatClosed = await waitFor('drawer closed by the backdrop tap', timeoutMs, async () => {
        try {
          const state = { open: await drawerOpen(client) }
          return state.open ? null : state
        } catch {
          return null
        }
      }).catch(() => null)
      const leftover = await client.evaluate(`document.querySelector(${JSON.stringify(BACKDROP_SELECTOR)}) !== null`)
      if (flatClosed !== null && !leftover) pass('fade.flat-close-untouched', 'tap close closed the drawer and left no layer')
      else fail('fade.flat-close-untouched', `closed=${flatClosed !== null} leftover=${leftover}`)
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

await main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  fail('probe.crashed', message)
  const failures = results.filter((entry) => entry.status === 'FAIL').length
  console.log(`SUMMARY pass=${results.filter((entry) => entry.status === 'PASS').length} fail=${failures}`)
  process.exitCode = 1
})

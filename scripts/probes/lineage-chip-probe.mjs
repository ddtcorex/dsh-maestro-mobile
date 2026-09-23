// CDP probe for the mobile lineage chip's touch shim (dsh-maestro-mobile).
//
// Guards the three things the shim does on a phone: it marks the chip box so its
// own scope is stable across upstream rebuilds, it swallows the trusted hover
// events a tap synthesizes inside that scope (era-1 hover timers feed on them and
// can resurrect a just-closed card), and one tap still means exactly one toggle.
//
// The scope is measured against the chip's real box and the real catalog rather
// than against the plugin's selector, so a selector that names nothing — the
// 0.1.7 regression, where all four CSS-module-hash literals matched no element
// while the box is `IwR9Qa_root` and the catalog `IwR9Qa_menu` — fails here
// instead of passing vacuously.
//
// Env: DSH_PROBE_URL (default http://127.0.0.1:3080/),
//      DSH_PROBE_SESSION_LABEL (optional: open the drawer row containing this
//        text; default is the first row that owns an action button),
//      DSH_PROBE_CHROME (default chromium), DSH_PROBE_TIMEOUT_MS (default 30000).
// The default `chromium` may be a snap stub that never launches on this machine
// (docs/maintenance/pitfalls.md); pass the real binary when the probe times out
// before its first check.
// Exits 0 only when every required check passes.
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DEFAULT_URL = 'http://127.0.0.1:3080/'
const DEFAULT_TIMEOUT_MS = 30_000
const FRAME_SELECTOR = '[data-mobile-nav="frame"]'
const MOBILE_STYLE_SELECTOR = 'style[data-plugin="@ddtcorex/dsh-maestro-mobile"]'
const CHIP_SELECTOR = '[data-slot="conversation.session.header"] button[class*="_trigger"][aria-haspopup="tree"]'
const HOVER_TYPES = ['mouseover', 'mouseout', 'mouseenter', 'mouseleave']

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
  return {
    url: parsedUrl.href,
    rowLabel: env.DSH_PROBE_SESSION_LABEL?.trim() || null,
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
 * Open the header: the hero (blank session) renders no session header, so a real
 * Session must be selected through the drawer first. Read-only: it selects a
 * session, it never mutates one.
 */
async function revealHeader(client, config) {
  const mounted = await client.evaluate(`document.querySelector(${JSON.stringify(CHIP_SELECTOR)}) !== null`)
  if (mounted) return 'chip already mounted'
  await client.evaluate(`document.querySelector('button[aria-label="Open sidebar"]')?.click()`)
  await sleep(1_200)
  const opened = await client.evaluate(`(() => {
    const rows = [...document.querySelectorAll('[class*="_sessionRow"]')]
      .filter((row) => row.querySelector('button') !== null);
    const wanted = ${JSON.stringify(config.rowLabel)};
    const row = wanted === null ? rows[0] : rows.find((candidate) => (candidate.textContent || '').includes(wanted));
    if (row === undefined) return null;
    row.click();
    return (row.textContent || '').trim().slice(0, 40);
  })()`)
  if (opened === null) return 'no session row in the drawer'
  await sleep(2_500)
  await client.evaluate(`document.querySelector('[data-mobile-nav="backdrop"]')?.click()`)
  await sleep(600)
  return `opened "${opened}"`
}

/** Tap the point through a real touch sequence, then read the chip's state. */
async function tap(client, x, y) {
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, radiusX: 2, radiusY: 2, force: 1 }],
  })
  await sleep(45)
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await sleep(150)
  const immediate = await client.evaluate(`document.querySelector(${JSON.stringify(CHIP_SELECTOR)}).getAttribute('aria-expanded')`)
  await sleep(700)
  const settled = await client.evaluate(`document.querySelector(${JSON.stringify(CHIP_SELECTOR)}).getAttribute('aria-expanded')`)
  return { immediate, settled }
}

async function main() {
  const config = readConfig()
  const port = await allocatePort()
  const userDataDir = await mkdtemp(join(tmpdir(), 'dsh-lineage-chip-'))
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
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
    await client.send('Page.navigate', { url: config.url })

    const armed = await waitFor('mobile shell', config.timeoutMs, async () => {
      try {
        return await client.evaluate(`document.querySelector(${JSON.stringify(FRAME_SELECTOR)}) !== null
          && matchMedia('(pointer: coarse)').matches
          && document.querySelector(${JSON.stringify(MOBILE_STYLE_SELECTOR)}) !== null`)
      } catch {
        return false
      }
    }).catch(() => null)
    if (armed === null) {
      fail('lineage-chip.frame', 'mobile shell never armed (frame marker + coarse pointer + plugin stylesheet)')
      return
    }
    const revealed = await revealHeader(client, config)
    pass('lineage-chip.frame', revealed)

    const chip = await client.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(CHIP_SELECTOR)});
      if (el === null) return null;
      const r = el.getBoundingClientRect();
      const box = el.parentElement;
      // The probe's own scope: the chip's real box and the real catalog, captured
      // here so the swallow check cannot go vacuous on a stale plugin selector.
      window.__chipBox = box;
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2),
        label: el.getAttribute('aria-label'), open: el.getAttribute('aria-expanded'),
        boxMarked: box !== null && box.hasAttribute('data-lineage-root'),
        boxClass: box === null ? null : String(box.className).slice(0, 20) };
    })()`)

    if (chip === null) {
      skip('lineage-chip.mark', 'no lineage chip in this session (open one with subagents and re-run)')
      skip('lineage-chip.scope', 'no lineage chip in this session')
      skip('lineage-chip.swallow', 'no lineage chip in this session')
      return
    }

    // 1. The box marker the swallow scopes to.
    if (chip.boxMarked) pass('lineage-chip.mark', `box ${chip.boxClass} carries data-lineage-root`)
    else fail('lineage-chip.mark', `box ${chip.boxClass} has no data-lineage-root marker`)

    // 2. The scope reaches the portalled catalog too: open the card through a
    //    plain click (the shim's own tap path is exercised in check 3) and look
    //    for the catalog outside the box.
    await client.evaluate(`document.querySelector(${JSON.stringify(CHIP_SELECTOR)})?.click()`)
    await sleep(700)
    const menu = await client.evaluate(`(() => {
      const tree = document.querySelector('[class*="_menu"] > [role="tree"]');
      if (tree === null) return { found: false };
      const box = tree.parentElement;
      const scope = [document.querySelector('[data-lineage-root]'), box];
      return { found: true, portalled: !window.__chipBox.contains(box),
        parent: box.parentElement === null ? null : box.parentElement.tagName,
        rows: box.querySelectorAll('[role="treeitem"]').length,
        scopeResolves: scope.every((el) => el !== null) };
    })()`)
    if (!menu.found) {
      fail('lineage-chip.scope', 'the catalog did not open (no [class*="_menu"] > [role="tree"] in the page)')
    } else if (!menu.portalled) {
      fail('lineage-chip.scope', `catalog is not portalled (parent ${menu.parent}) — scope may be stale`)
    } else {
      pass('lineage-chip.scope', `catalog portalled to ${menu.parent}, ${menu.rows} rows, scope reaches both boxes`)
    }

    // Close it again so the swallow checks run from the closed state.
    await client.evaluate(`document.querySelector(${JSON.stringify(CHIP_SELECTOR)})?.click()`)
    await sleep(500)

    // Recorder: anything the shim swallows at document capture never reaches it.
    await client.evaluate(`(() => {
      window.__hoverSeen = [];
      const chipSelector = ${JSON.stringify(CHIP_SELECTOR)};
      // Resolve the chip's box at event time: a React re-render can replace the
      // element a captured reference points at, which would make this vacuous.
      const inScope = (target) => {
        const chip = document.querySelector(chipSelector);
        const box = chip === null ? null : chip.parentElement;
        if (box !== null && (target === box || box.contains(target))) return true;
        return target.closest('[class*="_menu"]:has(> [role="tree"])') !== null;
      };
      for (const type of ${JSON.stringify(HOVER_TYPES)}) {
        document.addEventListener(type, (event) => {
          const target = event.target;
          if (!(target instanceof Element)) return;
          if (!inScope(target)) return;
          window.__hoverSeen.push([type, target.tagName, String(target.className || '').slice(0, 18), event.isTrusted]);
        }, true);
      }
    })()`)

    // 4. One tap, one toggle — the behaviour the swallow protects. The chip's own
    //    click path can only OPEN this variant (upstream pins instead of
    //    toggling), so the expected states are derived from the state the taps
    //    start in rather than assumed.
    const readState = () => client.evaluate(
      `document.querySelector(${JSON.stringify(CHIP_SELECTOR)}).getAttribute('aria-expanded')`,
    )
    const started = await readState()
    const first = await tap(client, chip.x, chip.y)
    const second = await tap(client, chip.x, chip.y)
    if (await readState() !== 'true') await tap(client, chip.x, chip.y)
    const outside = await tap(client, 150, chip.y)
    const seen = await client.evaluate(`window.__hoverSeen`)

    // 3. The swallow: no in-scope trusted hover event may reach a later listener.
    if (seen.length === 0) pass('lineage-chip.swallow', 'no in-scope hover event reached the document')
    else {
      fail('lineage-chip.swallow',
        `${seen.length} in-scope hover event(s) reached the document, first ${JSON.stringify(seen[0])}`)
    }

    const states = [first, second, outside]
    const expected = [started === 'true' ? 'false' : 'true', started, 'false']
    const actual = states.map(state => state.settled)
    const flashed = states.filter(state => state.immediate !== state.settled).length
    if (actual.join(',') === expected.join(',')) {
      pass('lineage-chip.toggle',
        `toggled and closed settled ${actual.join(',')} from ${started}${flashed > 0 ? ` (${flashed} moved after settle)` : ''}`)
    } else {
      fail('lineage-chip.toggle',
        `settled ${actual.join(',')} expected ${expected.join(',')} from ${started} (label "${chip.label}")`)
    }
  } finally {
    if (client !== undefined) client.close()
    chrome.kill('SIGKILL')
    await rm(userDataDir, { recursive: true, force: true }).catch(() => { /* best effort */ })
  }
}

try {
  await main()
} catch (error) {
  fail('lineage-chip.probe', error instanceof Error ? error.message : String(error))
}

const failures = results.filter((row) => row.status === 'FAIL')
console.log(failures.length === 0
  ? `lineage-chip probe: ${results.filter((row) => row.status === 'PASS').length} passed, ${results.filter((row) => row.status === 'SKIP').length} skipped`
  : `lineage-chip probe: ${failures.length} failed`)
if (failures.length > 0) process.exitCode = 1

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
// Anchored on the marker upstream puts on the chip's own root, never on a role
// value it is free to change: 0.2.2 moved aria-haspopup from "tree" to "dialog"
// and the old selector matched nothing, so every check that depends on it would
// have SKIPped while the feature was silently dead (measured live 2026-11-20).
const CHIP_SELECTOR = '[data-slot="conversation.session.header"] [data-subagent-action] button[class*="_trigger"][aria-expanded]'
// Both channels the tap's hover travels on: the mouse family is what the shim
// silenced originally, and 0.2.2 moved the same timer pair to pointerout /
// pointerleave (the lineage root carries onPointerLeave -> scheduleHoverClose).
// Recording only the mouse family here would let the leak that closes a
// just-opened card pass this probe.
const HOVER_TYPES = ['mouseover', 'mouseout', 'mouseenter', 'mouseleave', 'pointerout', 'pointerleave']

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

/** How many drawer rows to open while looking for a session that has a chip. */
const ROW_SCAN_LIMIT = 8
/** How long one row may take to render its lineage chip (projection load). */
const CHIP_WAIT_MS = 12_000

/** Labels of the drawer rows that own an action button (i.e. real sessions). */
async function sessionRows(client) {
  return client.evaluate(`(() => [...document.querySelectorAll('[class*="_sessionRow"]')]
    .filter((row) => row.querySelector('button') !== null)
    .map((row) => (row.textContent || '').trim().slice(0, 60)))()`)
}

/** Make sure the sessions drawer is open. */
async function openDrawer(client) {
  const open = await client.evaluate(`document.querySelector('[data-mobile-nav="backdrop"]') !== null`)
  if (open) return
  await client.evaluate(`document.querySelector('button[aria-label="Open sidebar"]')?.click()`)
  await sleep(1_200)
}

/** Select the row whose label starts with `label`. */
async function openRow(client, label) {
  return client.evaluate(`(() => {
    const rows = [...document.querySelectorAll('[class*="_sessionRow"]')]
      .filter((row) => row.querySelector('button') !== null);
    const wanted = ${JSON.stringify(label)};
    const row = rows.find((candidate) => (candidate.textContent || '').trim().startsWith(wanted));
    if (row === undefined) return false;
    row.click();
    return true;
  })()`)
}

/**
 * Open the header: the hero (blank session) renders no session header, so a real
 * Session must be selected through the drawer first. Read-only: it selects a
 * session, it never mutates one.
 *
 * A session only carries a lineage chip if it ever spawned subagents, so a probe
 * that always looks at the FIRST row skips exactly when the chip matters. It
 * therefore scans rows in order (bounded by ROW_SCAN_LIMIT) until one renders the
 * chip, or reports that none of the scanned rows has one.
 */
async function revealHeader(client, config) {
  const mounted = await client.evaluate(`document.querySelector(${JSON.stringify(CHIP_SELECTOR)}) !== null`)
  if (mounted) return 'chip already mounted'
  await openDrawer(client)
  const rows = await sessionRows(client)
  if (rows.length === 0) return 'no session row in the drawer'
  const wanted = config.rowLabel
  const candidates = wanted === null
    ? rows.slice(0, ROW_SCAN_LIMIT)
    : rows.filter((label) => label.includes(wanted))
  if (candidates.length === 0) return `no row labelled "${wanted}"`
  const scanned = []
  for (const label of candidates) {
    await openDrawer(client)
    if (!await openRow(client, label)) continue
    // The chip appears only once the client has loaded that session's projection,
    // which happened four to six seconds after the row click on 0.2.2-rc.2
    // (measured 2026-11-20). A fixed sleep either skips a chip that is coming or
    // wastes the whole scan, so wait for the condition with a bound.
    const found = await waitFor('lineage chip', CHIP_WAIT_MS, async () => {
      try {
        return await client.evaluate(`document.querySelector(${JSON.stringify(CHIP_SELECTOR)}) !== null`)
      } catch {
        return false
      }
    }).catch(() => false)
    scanned.push(`${label}${found ? ' [chip]' : ' [no chip]'}`)
    if (!found) continue
    await client.evaluate(`document.querySelector('[data-mobile-nav="backdrop"]')?.click()`)
    await sleep(600)
    return { where: `opened "${label}"`, scanned }
  }
  return { where: `no lineage chip in ${scanned.length} scanned row(s)`, scanned }
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
    // The reported failure was "the agent icon does not show in dark mode", and
    // every check below is colour-agnostic except the contrast row, so the probe
    // runs on the phone the report came from: dark scheme, `body[data-ds-dark-theme]`.
    await client.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: 'dark' }],
    })
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
    if (typeof revealed === 'string') {
      pass('lineage-chip.frame', revealed)
    } else {
      pass('lineage-chip.frame', revealed.where)
      for (const row of revealed.scanned) console.log(`  row ${row}`)
    }

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

    // 1b. The compact badge must still SHOW upstream's glyph. The collapse rule
    //     hides the "N subagents" sentence, and 0.2.2 wrapped the glyph in a
    //     direct `<span>` child, so a blanket `> span` rule hid the icon too and
    //     the badge became an empty circle whose only content is the count pill
    //     (measured on the pre-fix build: span activitySlot display none, users
    //     svg rect 0x0). A rect and a display read are not a render, so the glyph
    //     is also hit-tested: a glyph painted outside the control, or under a
    //     sibling, fails here.
    const glyph = await client.evaluate(`(() => {
      const trigger = document.querySelector(${JSON.stringify(CHIP_SELECTOR)});
      const sentence = trigger.querySelector('[data-subagent-count]');
      const svgs = [...trigger.querySelectorAll('svg')];
      const painted = svgs
        .map((el) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return {
            icon: el.getAttribute('data-icon'),
            state: el.getAttribute('data-state'),
            width: Math.round(r.width), height: Math.round(r.height),
            left: r.left, top: r.top,
            shown: r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0',
            color: cs.color,
          };
        });
      const visible = painted.filter((svg) => svg.shown);
      const users = painted.find((svg) => svg.icon !== null) ?? null;
      const spinner = painted.find((svg) => svg.state !== null) ?? null;
      const hit = visible.length === 0
        ? null
        : document.elementFromPoint(visible[0].left + visible[0].width / 2, visible[0].top + visible[0].height / 2);
      const channels = (value) => String(value).split('(').pop().split(')')[0].split(',').slice(0, 3).map(Number);
      const luminance = (rgb) => {
        const linear = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
      };
      // The first OPAQUE ancestor fill: a translucent layer would make the ratio
      // read against a colour that is not what the eye sees.
      const opaque = (bg) => {
        const parts = bg.split('(').pop().split(')')[0].split(',');
        return parts.length === 3 || Number(parts[3]) === 1;
      };
      let backdrop = null;
      for (let node = trigger; node !== null; node = node.parentElement) {
        const bg = getComputedStyle(node).backgroundColor;
        if (opaque(bg)) { backdrop = bg; break; }
      }
      let ratio = null;
      const ink = visible.length === 0 ? null : visible[0].color;
      if (ink !== null && backdrop !== null) {
        const above = luminance(channels(ink));
        const base = luminance(channels(backdrop));
        ratio = Math.round(((Math.max(above, base) + 0.05) / (Math.min(above, base) + 0.05)) * 100) / 100;
      }
      return {
        painted,
        visibleCount: visible.length,
        visibleSize: visible.length === 0 ? null : [visible[0].width, visible[0].height],
        visibleIcon: visible.length === 0 ? null : visible[0].icon,
        visibleState: visible.length === 0 ? null : visible[0].state,
        insideTrigger: hit !== null && (hit === trigger || trigger.contains(hit)),
        usersShown: users !== null && users.shown,
        spinnerShown: spinner !== null && spinner.shown,
        ink, backdrop, ratio,
        sentence: sentence === null ? null : getComputedStyle(sentence).display,
        dark: matchMedia('(prefers-color-scheme: dark)').matches,
      };
    })()`)
    // Exactly one glyph owns the 28px circle: the users icon while everything is
    // idle, upstream's spinner while a subagent runs. Two at once would mean the
    // hand-off rules stopped applying, zero means the badge is empty.
    if (glyph.visibleCount === 1 && glyph.insideTrigger && glyph.visibleSize.join('x') === '15x15') {
      pass('lineage-chip.glyph', `${glyph.visibleIcon ?? `spinner(${glyph.visibleState})`} painted 15x15 inside the trigger`)
    } else {
      fail('lineage-chip.glyph',
        `visible=${glyph.visibleCount} size=${JSON.stringify(glyph.visibleSize)} insideTrigger=${glyph.insideTrigger} glyphs=${JSON.stringify(glyph.painted)}`)
    }
    // 1b-2. The same hand-off at a coarse width ABOVE upstream's own container
    // breakpoint. Upstream renders the users icon with the compactIcon class
    // while a subagent runs, and that class is `display: none` outside
    // `@container (max-width: 460px)`; the plugin's own block runs to 1023px on
    // coarse pointers, so a tablet in the 461-1023px band can hide the icon while
    // the badge still applies. This row proves the slot is never empty in that
    // band: whatever glyph owns it (icon or spinner), exactly one must paint.
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 800, height: 1000, deviceScaleFactor: 2, mobile: true, hasTouch: true,
    })
    await sleep(700)
    const wide = await client.evaluate(`(() => {
      const trigger = document.querySelector(${JSON.stringify(CHIP_SELECTOR)});
      const svgs = [...trigger.querySelectorAll('svg')].map((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          icon: el.getAttribute('data-icon') ?? null,
          state: el.getAttribute('data-state') ?? null,
          width: Math.round(r.width), height: Math.round(r.height),
          shown: r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden',
        };
      });
      return { svgs, painted: svgs.filter((svg) => svg.shown) };
    })()`)
    if (wide.painted.length === 1) {
      pass('lineage-chip.glyph-wide', `${wide.painted[0].icon ?? `spinner(${wide.painted[0].state})`} painted at 800px coarse`)
    } else {
      fail('lineage-chip.glyph-wide', `${wide.painted.length} glyphs painted at 800px coarse: ${JSON.stringify(wide.svgs)}`)
    }
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 2, mobile: true, hasTouch: true,
    })
    await sleep(500)

    // 1c. The running hand-off. It needs a subagent that is running at the
    // moment the probe samples, which a probe cannot summon, so this row SKIPs
    // when the chip is idle and names why; the CSS itself is pinned by
    // tests/lineage-chip-glyph.test.ts.
    if (glyph.visibleState === null && !glyph.spinnerShown) {
      skip('lineage-chip.running', 'no subagent running at sample time (idle chip), hand-off not exercised')
    } else if (glyph.spinnerShown && !glyph.usersShown) {
      pass('lineage-chip.running', 'spinner took the slot and the users glyph stepped aside')
    } else {
      fail('lineage-chip.running', `spinnerShown=${glyph.spinnerShown} usersShown=${glyph.usersShown} visible=${glyph.visibleCount}`)
    }
    // The sentence must stay collapsed, or the circle grows back into the wide
    // trigger this badge exists to prevent.
    if (glyph.sentence === null) skip('lineage-chip.sentence', 'this host renders no [data-subagent-count] span')
    else if (glyph.sentence === 'none') pass('lineage-chip.sentence', 'the "N subagents" sentence stays collapsed')
    else fail('lineage-chip.sentence', `the sentence span renders (display ${glyph.sentence}) and stretches the badge`)
    // Dark mode is where the owner reported the badge as missing, so the ink is
    // measured against the pill's real backdrop instead of assumed to be visible.
    if (glyph.visibleCount === 0) skip('lineage-chip.contrast', 'nothing is painted, so there is no ink to measure')
    else if (glyph.ratio === null) skip('lineage-chip.contrast', 'no opaque backdrop resolved behind the chip')
    else if (glyph.ratio >= 3) pass('lineage-chip.contrast', `ink ${glyph.ink} on ${glyph.backdrop} = ${glyph.ratio}:1 (dark=${glyph.dark})`)
    else fail('lineage-chip.contrast', `ink ${glyph.ink} on ${glyph.backdrop} = ${glyph.ratio}:1 is under 3:1 (dark=${glyph.dark})`)

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

// CDP probe for the mobile session-header background-jobs chip
// (dsh-maestro-mobile).
//
// Guards three things the 0.1.7 upgrade broke at once:
//   1. the jobs marker lands on the jobs control, never on another header
//      accordion (0.1.7 moved the subagent catalog into the same band, ahead of
//      the jobs control, so "first accordion" became the lineage trigger);
//   2. that control renders as the compact 28px chip with its count;
//   3. every resident in the band sits on one gap, so the header's controls
//      read evenly (the row ends included: the drawer toggle beside the title,
//      the last resident beside the corner toggle).
//
// The jobs chip is identified independently of the plugin's own selector: a
// live job draws its state dot inside the trigger, which is a property of the
// jobs control alone. The marker checks therefore fail on a build whose
// selector matches the wrong control, and the compact check is state-gated on a
// live job (SKIP otherwise, so the probe is still useful on an idle host).
//
// Env: DSH_PROBE_URL (default http://127.0.0.1:3080/),
//      DSH_PROBE_SESSION_LABEL (optional: open the drawer row containing this
//        text; default is the first row that owns an action button, which is
//        where a background job is most likely to be),
//      DSH_PROBE_CHROME (default chromium), DSH_PROBE_TIMEOUT_MS (default
//        30000).
// The default `chromium` may resolve to a snap stub that never launches on this
// machine (docs/maintenance/pitfalls.md); pass DSH_PROBE_CHROME with the real
// binary when the probe times out before its first check.
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
const TOGGLE_SELECTOR = 'button[data-mobile-nav="toggle"]'
/** How far a measured gap may differ from the band's own gap, in px. */
const GAP_TOLERANCE = 0.75

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
 * One snapshot of everything the checks read, taken in a single evaluate so no
 * two rows can describe different layout passes.
 */
const SNAPSHOT = `(() => {
  const round = (n) => Math.round(n * 10) / 10;
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { x: round(r.x), right: round(r.right), w: round(r.width), h: round(r.height) };
  };
  const band = document.querySelector('[data-slot="conversation.session.header.actions"]');
  const marker = (el) => {
    const first = el.firstElementChild;
    return {
      label: el.getAttribute('aria-label'),
      nav: el.getAttribute('data-mobile-nav'),
      count: el.getAttribute('data-jobs-count'),
      popup: el.getAttribute('aria-haspopup'),
      firstTag: first === null ? null : first.tagName.toLowerCase(),
      // An SVG element's className is an SVGAnimatedString, so read the
      // attribute: the live state dot carries the triggerDot fragment.
      firstDot: first !== null && (first.getAttribute('class') || '').includes('_triggerDot'),
      ...box(el),
    };
  };
  // The band element itself is display: contents; the flex container is its
  // parent, and that is where the gap lives. Residents are ordered by their
  // painted x, not by DOM order: the mode label carries order:1 to sit last.
  const residents = band === null ? [] : [...band.children]
    .filter((el) => getComputedStyle(el).position !== 'absolute')
    .map(marker)
    .filter((row) => row.w > 0 && row.h > 0)
    .sort((left, right) => left.x - right.x);
  const live = document.querySelector(
    '[data-slot="conversation.session.header.actions"] button[class*="_trigger"]:has(> [class*="_triggerDot"])',
  );
  const toggle = document.querySelector(${JSON.stringify(TOGGLE_SELECTOR)});
  const corner = document.querySelector('[data-conversation-header-corner] button');
  const crumbs = document.querySelector('[data-slot="conversation.session.header"] [class*="_crumbs"]');
  const bandRect = band === null ? null : band.getBoundingClientRect();
  return {
    frame: document.querySelector(${JSON.stringify(FRAME_SELECTOR)}) !== null,
    coarse: matchMedia('(pointer: coarse)').matches,
    style: document.querySelector(${JSON.stringify(MOBILE_STYLE_SELECTOR)}) !== null,
    band: bandRect === null ? null : box(band),
    bandGap: band === null || band.parentElement === null
      ? null
      : parseFloat(getComputedStyle(band.parentElement).gap) || 0,
    residents,
    // A resident starting left of the band's own box is the sliding chip that
    // covered the session title when the band could shrink under its content.
    headOverflow: bandRect === null || residents.length === 0 ? 0 : round(bandRect.x - residents[0].x),
    marked: [...document.querySelectorAll('[data-mobile-nav="jobs"], [data-jobs-count]')].map(marker),
    live: live === null ? null : marker(live),
    toggle: toggle === null ? null : box(toggle),
    corner: corner === null ? null : box(corner),
    crumbs: crumbs === null ? null : box(crumbs),
  };
})()`

const close = (from, to) => Math.round((to - from) * 10) / 10
const leadingInteger = (label) => {
  const match = /\d+/.exec(label ?? '')
  return match === null ? 0 : Number(match[0])
}

/** Report the marker checks that hold in any session. */
function checkIdentity(snapshot) {
  const wrong = snapshot.marked.filter((row) => row.popup !== null
    || (row.firstTag === 'svg' && !row.firstDot))
  if (wrong.length === 0) {
    const where = snapshot.live === null ? 'no live job' : `live job "${snapshot.live.label}"`
    pass('jobs-chip.identity', `${snapshot.marked.length} marked, ${where}`)
    return
  }
  fail(
    'jobs-chip.identity',
    wrong.map((row) => `"${row.label}" popup=${row.popup ?? '-'} first=${row.firstTag ?? '-'} nav=${row.nav ?? '-'}`).join(' | '),
  )
}

/** Report the compact-chip checks, which need a live job to render its dot. */
function checkCompact(snapshot) {
  if (snapshot.live === null) {
    skip('jobs-chip.compact', 'no live background job in this session (start one and re-run)')
    return
  }
  const problems = []
  if (snapshot.live.nav !== 'jobs') problems.push(`marker=${snapshot.live.nav ?? 'absent'}`)
  if (Math.abs(snapshot.live.w - 28) > GAP_TOLERANCE || Math.abs(snapshot.live.h - 28) > GAP_TOLERANCE) {
    problems.push(`size=${snapshot.live.w}x${snapshot.live.h}`)
  }
  const expected = String(leadingInteger(snapshot.live.label))
  if (snapshot.live.count !== expected) problems.push(`badge=${snapshot.live.count ?? 'absent'} expected=${expected}`)
  if (problems.length > 0) {
    fail('jobs-chip.compact', `${problems.join(' ')} label="${snapshot.live.label}"`)
    return
  }
  pass('jobs-chip.compact', `"${snapshot.live.label}" -> ${snapshot.live.w}px badge=${snapshot.live.count}`)
}

/** Report that the band's own residents sit on one gap. */
function checkRhythm(snapshot) {
  if (snapshot.residents.length < 2) {
    skip('jobs-chip.rhythm', `${snapshot.residents.length} resident(s) in the band`)
    return
  }
  const gaps = snapshot.residents.slice(1).map((row, index) => close(snapshot.residents[index].right, row.x))
  const off = gaps.filter((gap) => Math.abs(gap - snapshot.bandGap) > GAP_TOLERANCE)
  const detail = `bandGap=${snapshot.bandGap} gaps=${gaps.join(',')} residents=${snapshot.residents.length}`
  if (off.length > 0) fail('jobs-chip.rhythm', detail)
  else pass('jobs-chip.rhythm', detail)
}

/** Report the two row-end gaps that frame the band, plus the band's own box. */
function checkEdges(snapshot) {
  const problems = []
  const notes = []
  if (snapshot.headOverflow > GAP_TOLERANCE) {
    problems.push(`band overflow by ${snapshot.headOverflow}px`)
  }
  if (snapshot.toggle !== null && snapshot.crumbs !== null) {
    const head = close(snapshot.toggle.right, snapshot.crumbs.x)
    notes.push(`toggle->title=${head}`)
    if (Math.abs(head - snapshot.bandGap) > GAP_TOLERANCE) problems.push(`toggle->title=${head}`)
  }
  if (snapshot.crumbs !== null && snapshot.residents.length > 0) {
    const lead = close(snapshot.crumbs.right, snapshot.residents[0].x)
    notes.push(`title->band=${lead}`)
    if (Math.abs(lead - snapshot.bandGap) > GAP_TOLERANCE) problems.push(`title->band=${lead}`)
  }
  const last = snapshot.residents.at(-1)
  if (last !== undefined && snapshot.corner !== null) {
    const tail = close(last.right, snapshot.corner.x)
    notes.push(`band->corner=${tail}`)
    if (Math.abs(tail - snapshot.bandGap) > GAP_TOLERANCE) problems.push(`band->corner=${tail}`)
  }
  const detail = `${notes.join(' ')} bandGap=${snapshot.bandGap}`
  if (problems.length > 0) fail('jobs-chip.edges', `${problems.join(' | ')} (${detail})`)
  else pass('jobs-chip.edges', detail)
}

/**
 * Open the header: the hero (blank session) renders no actions band, so a real
 * Session must be selected through the drawer first. Read-only: it selects a
 * session, it never mutates one.
 */
async function revealHeader(client, config) {
  const mounted = await client.evaluate(`document.querySelector('[data-slot="conversation.session.header.actions"]') !== null`)
  if (mounted) return 'header already mounted'
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

async function main() {
  const config = readConfig()
  const port = await allocatePort()
  const userDataDir = await mkdtemp(join(tmpdir(), 'dsh-jobs-chip-'))
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
          && matchMedia('(pointer: coarse)').matches`)
      } catch {
        return false
      }
    }).catch(() => null)
    if (armed === null) {
      fail('jobs-chip.frame', 'mobile shell never armed (frame marker + coarse pointer)')
      return
    }

    const revealed = await revealHeader(client, config)
    const snapshot = await client.evaluate(SNAPSHOT)
    pass('jobs-chip.frame', revealed)
    checkIdentity(snapshot)
    checkCompact(snapshot)
    checkRhythm(snapshot)
    checkEdges(snapshot)
  } finally {
    if (client !== undefined) client.close()
    chrome.kill('SIGKILL')
    await rm(userDataDir, { recursive: true, force: true }).catch(() => { /* best effort */ })
  }
}

try {
  await main()
} catch (error) {
  fail('jobs-chip.probe', error instanceof Error ? error.message : String(error))
}

const failures = results.filter((row) => row.status === 'FAIL')
console.log(failures.length === 0
  ? `jobs-chip probe: ${results.filter((row) => row.status === 'PASS').length} passed, ${results.filter((row) => row.status === 'SKIP').length} skipped`
  : `jobs-chip probe: ${failures.length} failed`)
if (failures.length > 0) process.exitCode = 1

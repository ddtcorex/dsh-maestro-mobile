// CDP probe for the multi-width layout tiers (dsh-maestro-mobile).
//
// One probe covers all three tiers because the failures it guards share one
// root cause: a value measured on one tier leaking into another. The phone
// tiers (320-430) and the tablet tiers (768-1023) run the same mobile shell, so
// a geometry or gating regression at 768 shows up as a phone bug too; the
// desktop tier (1280, touch off) proves the pointer gate stays a no-op when the
// width alone would otherwise arm it. Splitting these into separate probes
// would let one tier pass while the boundary between tiers is broken.
//
// The header-icon check is an integration guard, not a styling check: the
// toggle renders its glyph through the host icon resolver
// (@deepseek-ai/dsh-client-ui-primitives). A renamed or missing export resolves
// to an empty component and paints nothing, while every marker, media query and
// stylesheet assertion still passes -- so the probe requires a real svg path.
//
// Env: DSH_PROBE_URL (default http://127.0.0.1:3082/),
//      DSH_PROBE_SESSION_ID (required), DSH_PROBE_CHROME (default chromium),
//      DSH_PROBE_TIMEOUT_MS (default 30000).
// The default `chromium` may resolve to a snap stub that never launches on this
// machine (docs/maintenance/pitfalls.md, "The default probe Chrome binary is a
// snap stub that never launches"); pass the real binary with
// DSH_PROBE_CHROME=/opt/google/chrome/chrome when the probe times out before
// its first check.
// Exits 0 only when every check passes.
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import net from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DEFAULT_URL = 'http://127.0.0.1:3082/'
const DEFAULT_TIMEOUT_MS = 30_000
const FRAME_SELECTOR = '[data-mobile-nav="frame"]'
const TOGGLE_SELECTOR = 'button[data-mobile-nav="toggle"]'
const MOBILE_STYLE_SELECTOR = 'style[data-plugin="@ddtcorex/dsh-maestro-mobile"]'
const CONTROLS = ['[data-mobile-nav="toggle"]', '[data-mobile-nav="fab"]', '[data-mobile-nav="backdrop"]']

/**
 * Every scene is a full page navigation with its own viewport and touch
 * profile. `touch: true` is what arms (pointer: coarse); headless Chrome
 * otherwise reports (pointer: none) and every mobile assertion would test the
 * desktop shell while claiming to test a phone.
 */
const SCENES = [
  { name: 'phone-320', width: 320, height: 568, touch: true, tier: 'mobile' },
  { name: 'phone-360', width: 360, height: 640, touch: true, tier: 'mobile' },
  { name: 'phone-390', width: 390, height: 844, touch: true, tier: 'mobile' },
  { name: 'phone-430', width: 430, height: 932, touch: true, tier: 'mobile' },
  { name: 'tablet-768', width: 768, height: 1024, touch: true, tier: 'mobile' },
  { name: 'tablet-1023', width: 1023, height: 768, touch: true, tier: 'mobile' },
  { name: 'desktop-1280', width: 1280, height: 800, touch: false, tier: 'desktop' },
]

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

const sleep = (resolveAfter) => new Promise((resolveSleep) => setTimeout(resolveSleep, resolveAfter))

async function waitFor(label, timeoutMs, probe) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await probe()
    if (value) return value
    if (Date.now() > deadline) throw new Error(`timeout waiting for ${label}`)
    await sleep(120)
  }
}

/** Same bounded wait, but resolves null instead of throwing (best-effort reveal). */
async function waitForOrNull(label, timeoutMs, probe) {
  try {
    return await waitFor(label, timeoutMs, probe)
  } catch {
    return null
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

async function setProfile(client, { width, height, touch }) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 2, mobile: touch, hasTouch: touch,
  })
  await client.send('Emulation.setTouchEmulationEnabled', {
    enabled: touch,
    ...(touch ? { maxTouchPoints: 5 } : {}),
  })
}

const MOBILE_SNAPSHOT = `(() => {
  const toggle = document.querySelector(${JSON.stringify(TOGGLE_SELECTOR)});
  const svg = toggle === null ? null : toggle.querySelector('svg');
  const paths = svg === null ? [] : [...svg.querySelectorAll('path')];
  const filled = paths.filter((path) => (path.getAttribute('d') || '').trim() !== '');
  const visible = (selector) => {
    const element = document.querySelector(selector);
    if (element === null) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  return {
    coarse: matchMedia('(pointer: coarse)').matches,
    frame: document.querySelector(${JSON.stringify(FRAME_SELECTOR)}) !== null,
    style: document.querySelector(${JSON.stringify(MOBILE_STYLE_SELECTOR)}) !== null,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    toggle: toggle !== null,
    toggleVisible: visible(${JSON.stringify(TOGGLE_SELECTOR)}),
    svg: svg !== null,
    filledPaths: filled.length,
    pathD: filled.length > 0 ? (filled[0].getAttribute('d') || '').slice(0, 24) : null,
  };
})()`

const DESKTOP_SNAPSHOT = `(() => {
  const visible = (selector) => {
    const element = document.querySelector(selector);
    if (element === null) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  return {
    coarse: matchMedia('(pointer: coarse)').matches,
    frame: document.querySelector(${JSON.stringify(FRAME_SELECTOR)}) !== null,
    controls: ${JSON.stringify(CONTROLS)}.map((selector) => visible(selector)),
  };
})()`

/**
 * The hero (new-session) screen renders ConversationSessionHeader with
 * hideChrome=true, so the session-header actions slot -- and the toggle with it
 * -- is not in the DOM until a non-blank session is open. Open the drawer and
 * click a real session row (the selected / "New Session" row has no action
 * button; every real row has one) to mount the header. Read-only: it selects a
 * session, it never mutates one.
 * @returns a short description of what the drive did, for the failure detail.
 */
async function revealHeader(client, timeoutMs) {
  const already = await client.evaluate(`document.querySelector(${JSON.stringify(TOGGLE_SELECTOR)}) !== null`)
  if (already) return 'toggle already mounted'
  await client.evaluate(`document.querySelector('button[aria-label="Open sidebar"]')?.click()`)
  const row = await waitForOrNull('session row', timeoutMs, async () => {
    try {
      return await client.evaluate(`(() => {
        const rows = [...document.querySelectorAll('[class*="_sessionRow"]')];
        const row = rows.find((candidate) => candidate.querySelector('button') !== null);
        if (row === undefined) return null;
        return { label: (row.textContent || '').trim().slice(0, 48) };
      })()`)
    } catch {
      return null
    }
  })
  if (row === null) return 'no session row in the drawer'
  await client.evaluate(`(() => {
    const rows = [...document.querySelectorAll('[class*="_sessionRow"]')];
    const row = rows.find((candidate) => candidate.querySelector('button') !== null);
    if (row !== undefined) row.click();
  })()`)
  const mounted = await waitForOrNull('header toggle', timeoutMs, async () => {
    try {
      return await client.evaluate(`document.querySelector(${JSON.stringify(TOGGLE_SELECTOR)}) !== null`)
    } catch {
      return false
    }
  })
  if (!mounted) return `session row clicked (${row.label}) but the toggle never mounted`
  // The row click can leave the drawer open over the header; close it through
  // the plugin's own backdrop so the icon assertion reads the on-screen header.
  await client.evaluate(`document.querySelector('[data-mobile-nav="backdrop"]')?.click()`)
  await sleep(300)
  return `session row clicked (${row.label})`
}

async function assertMobile(client, scene, timeoutMs) {
  const prefix = `layout.${scene.name}`
  // Bounded wait for the shell to arm, then assert either way: a shell that
  // never arms must produce the five FAIL rows below, not abort the run before
  // the remaining tiers are measured.
  await waitForOrNull(`${scene.name} mobile shell`, timeoutMs, async () => {
    try {
      const state = await client.evaluate(MOBILE_SNAPSHOT)
      return state.frame && state.coarse && state.style ? state : null
    } catch {
      return null
    }
  })
  const armed = await client.evaluate(MOBILE_SNAPSHOT)
  const drive = armed.frame && armed.coarse
    ? await revealHeader(client, timeoutMs)
    : 'not attempted (mobile shell never armed)'
  const state = await client.evaluate(MOBILE_SNAPSHOT)

  if (state.coarse) pass(`${prefix}.pointer-coarse`, 'true')
  else fail(`${prefix}.pointer-coarse`, 'matchMedia("(pointer: coarse)") is false with touch emulation on')

  if (state.frame) pass(`${prefix}.frame`, FRAME_SELECTOR)
  else fail(`${prefix}.frame`, 'frame marker missing')

  if (state.style) pass(`${prefix}.stylesheet`, MOBILE_STYLE_SELECTOR)
  else fail(`${prefix}.stylesheet`, 'plugin stylesheet missing')

  if (state.scrollWidth <= state.innerWidth + 1) {
    pass(`${prefix}.no-overflow`, `scrollWidth=${state.scrollWidth} innerWidth=${state.innerWidth}`)
  } else {
    fail(`${prefix}.no-overflow`, `scrollWidth=${state.scrollWidth} > innerWidth=${state.innerWidth}`)
  }

  if (state.toggle && state.svg && state.filledPaths > 0) {
    pass(`${prefix}.header-icon`, `paths=${state.filledPaths} d="${state.pathD}" visible=${state.toggleVisible}`)
  } else {
    fail(`${prefix}.header-icon`, `toggle=${state.toggle} svg=${state.svg} filledPaths=${state.filledPaths}; ${drive}`)
  }
}

async function assertDesktop(client, scene, timeoutMs) {
  const prefix = `layout.${scene.name}`
  // Bounded wait for the app shell to render, then assert: a plugin that armed
  // at desktop width must fail here, not abort the run.
  await waitForOrNull(`${scene.name} app shell`, timeoutMs, async () => {
    try {
      return await client.evaluate(`document.querySelector('[data-phase]') !== null`)
    } catch {
      return false
    }
  })
  const state = await client.evaluate(DESKTOP_SNAPSHOT)
  if (!state.coarse) pass(`${prefix}.pointer-fine`, `coarse=${state.coarse}`)
  else fail(`${prefix}.pointer-fine`, 'coarse pointer at desktop width')
  if (!state.frame) pass(`${prefix}.frame-absent`, 'no frame marker')
  else fail(`${prefix}.frame-absent`, 'frame marker present at desktop width')
  if (state.controls.every((visible) => visible === false)) {
    pass(`${prefix}.controls-hidden`, 'toggle/fab/backdrop all hidden')
  } else {
    fail(`${prefix}.controls-hidden`, `visible=${state.controls.filter(Boolean).length}`)
  }
}

async function main() {
  const url = process.env.DSH_PROBE_URL || DEFAULT_URL
  const sessionId = process.env.DSH_PROBE_SESSION_ID?.trim()
  if (!sessionId) throw new Error('DSH_PROBE_SESSION_ID is required')
  const timeoutMs = Number(process.env.DSH_PROBE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)

  const port = await allocatePort()
  const profileDir = await mkdtemp(join(homedir(), '.cache', 'dsh-mobile-multiwidth-'))
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
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `localStorage.setItem('dsh.sessions.current', ${JSON.stringify(JSON.stringify({ sessionId }))})`,
    })

    for (const scene of SCENES) {
      await setProfile(client, scene)
      await client.send('Page.navigate', { url })
      if (scene.tier === 'mobile') await assertMobile(client, scene, timeoutMs)
      else await assertDesktop(client, scene, timeoutMs)
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

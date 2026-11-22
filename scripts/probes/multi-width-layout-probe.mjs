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
// The header-icon check is an integration guard, not a styling check: the glyph
// comes from the host icon resolver (@deepseek-ai/dsh-client-ui-primitives). A
// renamed or missing export resolves to an empty component and paints nothing,
// while every marker, media query and stylesheet assertion still passes -- so
// the probe requires a glyph that actually boxes. It measures whichever drawer
// opener is on screen, because the host mounts its own and the plugin hides his
// while that one exists, and it accepts both icon implementations: an inline
// <path d> and the SVG sprite <use href="#..."> the host renders from 0.2.3.
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
/**
 * The host's own drawer opener. DSH 0.2.2-alpha.3 moved it into the drawer
 * corner's leading seat, and the plugin deliberately hides its own toggle while
 * this one is mounted ("one drawer opener, not two"), so on a current host this
 * is the control the user actually taps.
 */
const OPENER_SELECTOR = '[data-slot="shell.leading"] button[data-sidebar-opener]'
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
  const visible = (element) => {
    if (element === null) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  /**
   * Describe one drawer opener and whether its glyph actually paints.
   * Accepts both icon implementations: an inline <path d> (older host) and the
   * SVG sprite <use href="#..."> the host renders now. A <use> whose symbol is
   * missing or unregistered boxes at 0x0, which is the broken-resolver case this
   * assertion exists to catch.
   */
  const describe = (source, element) => {
    if (element === null) return { source, present: false, visible: false, resolved: false, glyph: 'absent' };
    const svg = element.querySelector('svg');
    const paths = svg === null ? [] : [...svg.querySelectorAll('path')].filter((path) => (path.getAttribute('d') || '').trim() !== '');
    const use = svg === null ? null : svg.querySelector('use');
    let box = { w: 0, h: 0 };
    if (use !== null) {
      try { const raw = use.getBBox(); box = { w: Math.round(raw.width), h: Math.round(raw.height) }; } catch (error) { box = { w: 0, h: 0 }; }
    }
    const rect = element.getBoundingClientRect();
    const shown = visible(element);
    const glyph = paths.length > 0 ? 'path' : (box.w > 0 && box.h > 0 ? 'sprite' : 'none');
    return {
      source, present: true, visible: shown,
      width: Math.round(rect.width), height: Math.round(rect.height),
      glyph, glyphBox: box, resolved: shown && glyph !== 'none',
    };
  };
  const candidates = [
    describe('host-opener', document.querySelector(${JSON.stringify(OPENER_SELECTOR)})),
    describe('plugin-toggle', document.querySelector(${JSON.stringify(TOGGLE_SELECTOR)})),
  ];
  /**
   * Every visible header glyph must sit on its own button's centre line.
   *
   * This guards the class, not one icon: the plugin once carried an optical
   * nudge (a translate) tuned for the host Files arrow. Upstream moved that
   * action out of the utilities band, the Session panel toggle moved in, and
   * the nudge shifted a flat-list glyph whose ink is symmetrical, so the band
   * read as "the icons are not on one line". A glyph offset here means some
   * rule is translating or padding a glyph instead of letting the button's
   * flex centring place it.
   */
  const headerGlyphs = () => {
    const scope = document.querySelector('[data-slot="conversation.session.header"]');
    if (scope === null) return [];
    const rows = [];
    for (const button of scope.querySelectorAll('button')) {
      if (!visible(button)) continue;
      const svg = button.querySelector('svg');
      if (svg === null || !visible(svg)) continue;
      const br = button.getBoundingClientRect();
      const sr = svg.getBoundingClientRect();
      rows.push({
        label: ((button.getAttribute('aria-label') || button.textContent || '').trim().slice(0, 22)) || button.tagName.toLowerCase(),
        dy: Math.round(((sr.top + sr.bottom) / 2 - (br.top + br.bottom) / 2) * 10) / 10,
        dx: Math.round(((sr.left + sr.right) / 2 - (br.left + br.right) / 2) * 10) / 10,
      });
    }
    return rows;
  };
  return {
    coarse: matchMedia('(pointer: coarse)').matches,
    frame: document.querySelector(${JSON.stringify(FRAME_SELECTOR)}) !== null,
    style: document.querySelector(${JSON.stringify(MOBILE_STYLE_SELECTOR)}) !== null,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    opener: candidates[0],
    toggle: candidates[1],
    control: candidates.find((candidate) => candidate.visible) || null,
    glyphs: headerGlyphs(),
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

  // Whichever drawer opener is on screen must paint a resolvable glyph. On a
  // current host that is the host's own leading-seat opener; the plugin's copy
  // is intentionally hidden there, so measuring only the plugin's toggle would
  // report a false failure on every touch tier.
  const shown = state.control
  if (shown !== null && shown.resolved) {
    pass(`${prefix}.header-icon`, `${shown.source} ${shown.width}x${shown.height} glyph=${shown.glyph} box=${shown.glyphBox.w}x${shown.glyphBox.h}`)
  } else {
    fail(`${prefix}.header-icon`, `no visible opener with a resolved glyph (opener=${JSON.stringify(state.opener)} toggle=${JSON.stringify(state.toggle)}); ${drive}`)
  }

  // One glyph off the button centre line is what "the icons do not line up"
  // looks like on a phone, and it is invisible to a box measurement because
  // the button stays 28px. 0.5px of tolerance covers subpixel rounding.
  const offCentre = state.glyphs.filter((glyph) => Math.abs(glyph.dy) > 0.5)
  if (state.glyphs.length === 0) {
    fail(`${prefix}.header-glyphs-centred`, `no header glyph measured; ${drive}`)
  } else if (offCentre.length === 0) {
    pass(`${prefix}.header-glyphs-centred`, `${state.glyphs.length} glyphs on the button centre line`)
  } else {
    fail(`${prefix}.header-glyphs-centred`, offCentre.map((glyph) => `${glyph.label} dy=${glyph.dy}`).join('; '))
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

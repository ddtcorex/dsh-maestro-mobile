// Ask-card audit probe (INFO probe): waits for a pending ask_user_question
// card in the seeded session (created by a live ask call while this probe
// runs), then measures the card's mobile geometry, button hit boxes, text
// overlaps and scroll ports at 390x844 touch, and screenshots baseline +
// expanded + footer-bottom states.
//
// Env: DSH_PROBE_SESSION_ID (required), DSH_PROBE_URL (default :3080),
// DSH_PROBE_CHROME (default /opt/google/chrome/chrome),
// DSH_PROBE_TIMEOUT_MS (default 180000), DSH_PROBE_OUT (default
// /tmp/dsh-cdp-probe/ask-audit).
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { readFile } from 'node:fs/promises'
import net from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const outDir = process.env.DSH_PROBE_OUT || '/tmp/dsh-cdp-probe/ask-audit'
const sessionId = process.env.DSH_PROBE_SESSION_ID?.trim()
if (!sessionId) throw new Error('DSH_PROBE_SESSION_ID is required')
const url = new URL(process.env.DSH_PROBE_URL || 'http://127.0.0.1:3080/')
const chromePath = process.env.DSH_PROBE_CHROME || '/opt/google/chrome/chrome'
const timeoutMs = Number(process.env.DSH_PROBE_TIMEOUT_MS || 180_000)
const PIN_FILE = join(homedir(), '.dsh', 'dsh-maestro-remote', 'pin')

const log = (msg) => console.log(`[ask-audit] ${msg}`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let cookieMinted = ''
try { cookieMinted = (await readFile(PIN_FILE, 'utf8')).trim() } catch { /* no pin */ }

async function mintPinCookie() {
  const res = await fetch(new URL('/maestro-login', url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ pin: cookieMinted }),
    redirect: 'manual',
  })
  const cookies = res.headers.getSetCookie?.() ?? []
  const cookie = cookies.map((e) => e.split(';')[0]).find((e) => e.startsWith('maestro_pin='))
  if (cookie !== undefined) return cookie
  return null
}

async function waitFor(label, ms, probe) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try {
      const v = await probe()
      if (v) return v
    } catch { /* retry */ }
    await sleep(500)
  }
  throw new Error(`timeout waiting for ${label}`)
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

const GEOMETRY_SNIPPET = `(() => {
  const r = (el) => {
    if (!el) return null
    const b = el.getBoundingClientRect()
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }
  }
  const q = (sel, root) => (root || document).querySelector(sel)
  const card = q('[data-question-key] [class*="_card"]')
  if (!card) return { absent: true }
  const frame = q('[data-question-key] [class*="_frame"]')
  const header = q('[data-question-key] [class*="_card"] > header')
  const eyebrow = q('[data-question-key] [class*="_eyebrow"]')
  const title = q('[data-question-key] [class*="_title"]')
  const titleText = (title && (() => { const rg = document.createRange(); rg.selectNodeContents(title); return r(rg) })()) || null
  const actions = q('[data-question-key] [class*="_headerActions"]')
  const buttons = actions ? [...actions.querySelectorAll('button')].map((b) => ({
    label: b.getAttribute('aria-label') || b.title || b.textContent?.trim() || 'btn',
    injected: b.dataset.mobileNav || null,
    rect: r(b),
    hit: (() => { const h = r(b); return h ? { x: h.x - 10, y: h.y - 10, w: h.w + 20, h: h.h + 20 } : null })(),
  })) : []
  const heading = q('[data-question-key] [class*="_headingBlock"]')
  const body = q('[data-question-key] [class*="_body"]')
  const options = q('[data-question-key] [class*="_options"]')
  const firstRow = q('[data-question-key] [class*="_option"]')
  const footer = q('[data-question-key] [class*="_footer"]')
  const pager = q('[data-question-key] [class*="_pager"]')
  const footerActions = q('[data-question-key] [class*="_footerActions"]')
  const feedback = q('[data-question-key] [class*="_feedback"]')
  const scrollport = (el) => el ? { scrollH: el.scrollHeight, clientH: el.clientHeight, scrollW: el.scrollWidth, clientW: el.clientWidth, scrollTop: el.scrollTop, sticky: getComputedStyle(el).position } : null
  const overlap = (a, b) => {
    if (!a || !b) return 0
    const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
    const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
    return x * y
  }
  const btnOverlaps = []
  for (let i = 0; i < buttons.length; i++) for (let j = i + 1; j < buttons.length; j++) {
    const area = overlap(buttons[i].hit, buttons[j].hit)
    if (area > 4) btnOverlaps.push({ a: buttons[i].label, b: buttons[j].label, area })
  }
  const textHits = eyebrow && buttons.length ? buttons.filter((btn) => overlap(titleText, btn.hit) > 4 || (eyebrow && (() => {
    const rg = document.createRange(); rg.selectNodeContents(eyebrow)
    return overlap(r(rg), btn.hit)
  })() > 4)).map((btn) => btn.label) : []
  return {
    card: r(card), frame: r(frame), header: r(header), eyebrow: r(eyebrow), titleText,
    headingBlock: r(heading), actions: r(actions), buttons, body: r(body),
    bodyScroll: scrollport(body), cardScroll: scrollport(card),
    titleScroll: title ? scrollport(title) : null,
    options: r(options), firstOption: r(firstRow),
    footer: r(footer), footerScroll: scrollport(footer),
    pager: r(pager), footerActions: r(footerActions), feedback: r(feedback),
    btnOverlaps, textHits,
    bandVar: getComputedStyle(card).height,
    cardMaxHeight: getComputedStyle(card).maxHeight,
    visualViewport: (() => { const vv = window.visualViewport; return vv ? { h: Math.round(vv.height), offsetTop: Math.round(vv.offsetTop) } : null })(),
    minimized: card.className.includes('Minimized'),
  }
})()`

async function main() {
  await mkdir('/tmp/dsh-cdp-probe', { recursive: true })
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })
  const port = await allocatePort()
  const profile = await mkdtemp(join(tmpdir(), 'ask-audit-'))
  const chrome = spawn(chromePath, [
    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' })
  let wsClient = null
  try {
    const target = await waitFor('chrome target', 20000, async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json`)
        if (!res.ok) return null
        const list = await res.json()
        return list.find((t) => t.type === 'page') || null
      } catch { return null }
    })
    const ws = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws fail')) })
    let id = 0
    const pending = new Map()
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id === undefined) return
      const entry = pending.get(msg.id)
      if (!entry) return
      pending.delete(msg.id)
      if (msg.error) entry.reject(new Error(JSON.stringify(msg.error)))
      else entry.resolve(msg.result)
    }
    const send = (method, params = {}) => new Promise((res, rej) => {
      const key = ++id
      pending.set(key, { resolve: res, reject: rej })
      ws.send(JSON.stringify({ id: key, method, params }))
    })
    const evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
      return result.result.value
    }
    wsClient = () => ws.close()

    await send('Page.enable')
    await send('Runtime.enable')
    await send('Network.enable')
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, hasTouch: true })
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })

    if (cookieMinted) {
      const cookie = await mintPinCookie()
      if (cookie) {
        const [name, value] = cookie.split('=')
        await send('Network.setCookie', { name, value, url: url.href, httpOnly: true, sameSite: 'Lax' })
        log('pin cookie minted')
      } else log('pin cookie NOT minted; continuing in case the listener trusts loopback')
    } else log('no pin file; hoping the listener trusts loopback')

    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `localStorage.setItem('dsh.sessions.current', ${JSON.stringify(JSON.stringify({ sessionId }))})`,
    })
    await send('Page.navigate', { url: url.href })
    await waitFor('mobile plugin boot', 30000, async () => evaluate(`document.querySelector('style[data-plugin="@ddtcorex/dsh-maestro-mobile"]') !== null
      && document.querySelector('[data-mobile-nav="frame"]') !== null
      && matchMedia('(max-width: 1023px) and (pointer: coarse)').matches`))
    log('mobile frame armed at 390x844 touch')

    log('waiting for a pending ask_user_question card (created by the live ask while this probe runs)')
    await waitFor('ask card', timeoutMs, () => evaluate(`!!document.querySelector('[data-question-key] [class*=\"_footer\"]')`))
    await sleep(700)
    log('card is live; capturing')

    const shot = async (name) => {
      const vp = await send('Page.getLayoutMetrics')
      const { width, height } = { width: 390, height: 844 }
      const data = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width, height, scale: 1 } })
      await writeFile(join(outDir, `${name}.png`), Buffer.from(data.data, 'base64'))
    }
    const geo = () => evaluate(GEOMETRY_SNIPPET)

    const g0 = await geo()
    await shot('1-baseline')
    await writeFile(join(outDir, 'baseline-geometry.json'), JSON.stringify(g0, null, 2))

    const expanded = await evaluate(`(() => {
      const btn = document.querySelector('[data-question-key] [data-mobile-nav="question-expand"]')
      if (!btn) return false
      btn.click()
      return true
    })()`)
    await sleep(600)
    const g1 = await geo()
    await shot('2-expanded')
    await writeFile(join(outDir, 'expanded-geometry.json'), JSON.stringify({ expander: expanded, ...g1 }, null, 2))

    await evaluate(`(() => { const c = document.querySelector('[data-question-key] [class*=\"_card\"]'); if (c) c.scrollTop = c.scrollHeight; return true })()`)
    await sleep(400)
    const g2 = await geo()
    await shot('3-card-bottom')
    await writeFile(join(outDir, 'bottom-geometry.json'), JSON.stringify(g2, null, 2))

    log('done; artifacts in ' + outDir)
    log(`overlap-pairs baseline: ${JSON.stringify(g0.btnOverlaps)}`)
    log(`text-hit buttons baseline: ${JSON.stringify(g0.textHits)}`)
  } finally {
    try { wsClient?.() } catch { /* ignore */ }
    chrome.kill('SIGKILL')
    await rm(profile, { recursive: true, force: true }).catch(() => {})
  }
}

main().then(
  () => process.exit(0),
  (err) => { console.error(`[ask-audit] FAILED ${err.stack || err}`); process.exit(1) },
)

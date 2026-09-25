// CDP probe for the mobile Settings bottom sheet (dsh-maestro-mobile).
//
// Guards the failure class a source-text test cannot see: a selector the
// browser REJECTS is dropped from the CSSOM whole, with no error anywhere, so
// the declarations silently never apply while every regex assertion on the
// source keeps passing. That is exactly what happened here — the overlay guard
// was written as `:has([class*="_panel"]:has([class*="_navList"]))`, `:has()`
// may not be nested inside `:has()`, and the four overlay rules were dead from
// 2026-08-30 until 2026-09-25. The sheet rendered as a floating centred card
// (equal gaps top and bottom) instead of a bottom sheet, and nothing failed.
//
// Checks:
//   1. the Settings overlay rules are present in the plugin sheet's CSSOM and
//      one of them carries the phone-tier `align-items: flex-end`
//      (rules-present + declarations-landed: the direct pin against the drop);
//   2. the panel is BOTTOM-ANCHORED on a phone (its bottom edge meets the
//      viewport bottom, top gap strictly larger than bottom gap);
//   3. the nav strip is ONE horizontal scroller (every cell on one y), not a
//      wrapped grid — the geometry the sheet exists to produce;
//   4. the close ✕ is hit-testable at its own centre (nothing paints over it).
//
// Env: DSH_PROBE_URL (default http://127.0.0.1:3080/),
//      DSH_PROBE_SESSION_ID (required — the session the page selects),
//      DSH_PROBE_PIN (optional; when unset the probe reads
//        ~/.dsh/dsh-maestro-remote/pin, because the canonical :3080 serves the
//        Maestro PIN login page and an unauthenticated probe would measure the
//        login screen instead of the app),
//      DSH_PROBE_CHROME (default /opt/google/chrome/chrome; the bare
//        `chromium` may be a snap stub that never launches — see
//        docs/maintenance/pitfalls.md), DSH_PROBE_TIMEOUT_MS (default 30000).
// Exits 0 only when every required check passes.
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DEFAULT_URL = 'http://127.0.0.1:3080/'
const DEFAULT_TIMEOUT_MS = 30_000
const FRAME_SELECTOR = '[data-mobile-nav="frame"]'
const MOBILE_STYLE_SELECTOR = 'style[data-plugin="@ddtcorex/dsh-maestro-mobile"]'
const OVERLAY_SELECTOR = '[class*="_overlay"]:has([class*="_navList"])'
const PANEL_SELECTOR = '[class*="_panel"]:has([class*="_navList"])'
/** The PIN file the Maestro proxy writes (see docs/upstream/upgrade-runbook.md). */
const PIN_FILE = join(homedir(), '.dsh', 'dsh-maestro-remote', 'pin')

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
  const sessionId = env.DSH_PROBE_SESSION_ID?.trim()
  if (!sessionId) throw new Error('DSH_PROBE_SESSION_ID is required (the session the page selects)')
  return {
    url: parsedUrl,
    sessionId,
    pin: env.DSH_PROBE_PIN?.trim() || null,
    chromePath: env.DSH_PROBE_CHROME || '/opt/google/chrome/chrome',
    timeoutMs,
  }
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

/**
 * Ask the Maestro proxy for a session cookie, when it gates on a PIN.
 *
 * A loopback-trusted listener (`loopbackTrusted`) deliberately answers 302
 * WITHOUT a set-cookie header — "nothing to authenticate on a locally trusted
 * listener" — so a missing cookie here is the expected local outcome, not a
 * failure. The distinction matters: treating it as a failure makes the probe
 * unusable on the very host it is meant to run against.
 * @returns 'cookie' with the pair, 'not-needed' for a trusted listener, 'failed'.
 */
async function mintPinCookie(url, pin) {
  const response = await fetch(new URL('/maestro-login', url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ pin }),
    redirect: 'manual',
  })
  const cookies = response.headers.getSetCookie?.() ?? []
  const cookie = cookies.map((entry) => entry.split(';')[0]).find((entry) => entry.startsWith('maestro_pin='))
  if (cookie !== undefined) return { outcome: 'cookie', cookie }
  // A 3xx without a cookie is the trusted-listener path; 200 is the login page,
  // i.e. the PIN was rejected.
  if (response.status >= 300 && response.status < 400) return { outcome: 'not-needed' }
  return { outcome: 'failed', status: response.status }
}

async function main() {
  const config = readConfig()
  const port = await allocatePort()
  const profileDir = await mkdtemp(join(homedir(), '.cache', 'dsh-maestro-mobile-sheet-'))
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
    await client.send('Network.enable')
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 2, mobile: true, hasTouch: true,
    })
    // (pointer: coarse) is what arms the mobile branch.
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })

    let pin = config.pin
    if (pin === null) {
      try {
        pin = (await readFile(PIN_FILE, 'utf8')).trim()
      } catch {
        pin = null
      }
    }
    if (pin !== null && pin !== '') {
      const attempt = await mintPinCookie(config.url, pin)
      if (attempt.outcome === 'failed') {
        fail('sheet.pin-login', `POST /maestro-login answered ${attempt.status} — the PIN was rejected`)
      } else if (attempt.outcome === 'not-needed') {
        pass('sheet.pin-login', 'loopback-trusted listener, no cookie required')
      } else {
        const [name, value] = attempt.cookie.split('=')
        await client.send('Network.setCookie', {
          name, value, url: config.url.href, httpOnly: true, sameSite: 'Lax',
        })
        pass('sheet.pin-login', `cookie ${name} minted`)
      }
    } else {
      skip('sheet.pin-login', 'no PIN configured (DSH_PROBE_PIN unset and no pin file)')
    }

    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `localStorage.setItem('dsh.sessions.current', ${JSON.stringify(JSON.stringify({ sessionId: config.sessionId }))})`,
    })
    await client.send('Page.navigate', { url: config.url.href })

    await waitFor('mobile plugin boot', config.timeoutMs, async () => {
      try {
        return await client.evaluate(`document.querySelector(${JSON.stringify(MOBILE_STYLE_SELECTOR)}) !== null
          && document.querySelector(${JSON.stringify(FRAME_SELECTOR)}) !== null
          && matchMedia('(max-width: 1023px) and (pointer: coarse)').matches`)
      } catch {
        return false
      }
    })
    pass('sheet.armed', 'plugin stylesheet + frame marker + MOBILE_QUERY')

    // Open the drawer, then Settings from it.
    await client.evaluate(`document.querySelector('button[aria-label="Open sidebar"]')?.click()`)
    await sleep(500)
    const openedSettings = await waitFor('Settings', config.timeoutMs, async () => {
      try {
        return await client.evaluate(`(() => {
          const matches = (value) => /^(settings|cài đặt|设置)$/i.test(value.trim());
          const candidates = [...document.querySelectorAll('button, [role="menuitem"], a')];
          const target = candidates.find((element) => matches(element.getAttribute('aria-label') ?? '')
            || matches(element.textContent ?? ''));
          if (target === undefined) return false;
          target.click();
          return true;
        })()`)
      } catch {
        return false
      }
    }).then(() => true).catch(() => false)
    if (!openedSettings) {
      fail('sheet.open', 'no Settings entry could be clicked from the drawer')
      throw new Error('Settings never opened')
    }
    await waitFor('Settings panel', config.timeoutMs, async () => {
      try {
        return await client.evaluate(`document.querySelector(${JSON.stringify(PANEL_SELECTOR)}) !== null`)
      } catch {
        return false
      }
    })
    pass('sheet.open', 'Settings panel mounted')

    // 1. The overlay rules must exist in the plugin sheet's CSSOM, and the
    //    phone-tier declaration must actually have landed. A rule the browser
    //    rejected is simply absent here — which is the whole point.
    const cssom = await client.evaluate(`(() => {
      const style = document.querySelector(${JSON.stringify(MOBILE_STYLE_SELECTOR)});
      if (style === null || style.sheet === null) return null;
      // Record the rule BEFORE recursing: CSSStyleRule carries its own (usually
      // empty) cssRules for CSS nesting in current Chrome, so recursing on
      // "has cssRules" alone skips every style rule and reports zero.
      const collect = (rules, out) => {
        for (const rule of rules) {
          if (typeof rule.selectorText === 'string') {
            out.push({ selector: rule.selectorText, alignItems: rule.style.alignItems });
          }
          if (rule.cssRules !== undefined && rule.cssRules.length > 0) collect(rule.cssRules, out);
        }
        return out;
      };
      const all = collect(style.sheet.cssRules, []);
      return {
        total: all.length,
        overlay: all.filter((rule) => rule.selector.includes('_overlay')),
      };
    })()`)
    if (cssom === null) {
      fail('sheet.cssom', 'the plugin stylesheet is not readable')
    } else if (cssom.overlay.length === 0) {
      fail('sheet.cssom', `0 rules mention _overlay out of ${cssom.total} — the selector was dropped`)
    } else {
      const bottomAnchor = cssom.overlay.find((rule) => rule.alignItems === 'flex-end')
      if (bottomAnchor === undefined) {
        fail('sheet.cssom', `${cssom.overlay.length} overlay rules, none carries align-items: flex-end`)
      } else {
        pass('sheet.cssom', `${cssom.overlay.length} overlay rules, flex-end landed`)
      }
    }

    // 2. Bottom-anchored on a phone: the panel's bottom edge meets the viewport
    //    bottom and the top gap is strictly larger.
    const geometry = await client.evaluate(`(() => {
      const overlay = document.querySelector(${JSON.stringify(OVERLAY_SELECTOR)});
      const panel = document.querySelector(${JSON.stringify(PANEL_SELECTOR)});
      if (overlay === null || panel === null) return null;
      const overlayStyle = getComputedStyle(overlay);
      const box = panel.getBoundingClientRect();
      return {
        alignItems: overlayStyle.alignItems,
        viewportHeight: window.innerHeight,
        panelTop: box.top,
        panelBottom: box.bottom,
        panelHeight: box.height,
      };
    })()`)
    if (geometry === null) {
      fail('sheet.geometry', 'overlay or panel not found')
    } else {
      const bottomGap = geometry.viewportHeight - geometry.panelBottom
      const topGap = geometry.panelTop
      const detail = `align=${geometry.alignItems} top=${topGap.toFixed(1)} bottom=${bottomGap.toFixed(1)} h=${geometry.panelHeight.toFixed(1)}`
      if (bottomGap <= 2 && topGap > bottomGap) pass('sheet.geometry', detail)
      else fail('sheet.geometry', `${detail} — expected bottom-anchored`)
    }

    // 3. Nav strip is ONE horizontal scroller, not a wrapped grid.
    const nav = await client.evaluate(`(() => {
      const list = document.querySelector(${JSON.stringify(PANEL_SELECTOR)} + ' [class*="_navList"]');
      if (list === null) return null;
      const style = getComputedStyle(list);
      const cells = [...list.children].map((cell) => cell.getBoundingClientRect().top);
      return {
        flexWrap: style.flexWrap,
        overflowX: style.overflowX,
        rows: new Set(cells.map((top) => Math.round(top))).size,
        cells: cells.length,
        scrollWidth: list.scrollWidth,
        clientWidth: list.clientWidth,
      };
    })()`)
    if (nav === null) {
      skip('sheet.nav-strip', 'no nav list rendered')
    } else if (nav.flexWrap === 'nowrap' && nav.overflowX === 'auto' && nav.rows === 1 && nav.cells > 1) {
      pass('sheet.nav-strip', `cells=${nav.cells} rows=1 scroll=${nav.scrollWidth}/${nav.clientWidth}`)
    } else {
      fail('sheet.nav-strip', `flex-wrap=${nav.flexWrap} overflow-x=${nav.overflowX} rows=${nav.rows} cells=${nav.cells}`)
    }

    // 4. The close ✕ is hit-testable at its own centre.
    const close = await client.evaluate(`(() => {
      const button = document.querySelector(${JSON.stringify(PANEL_SELECTOR)} + ' [class*="_close"]');
      if (button === null) return null;
      const box = button.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return {
        width: box.width,
        height: box.height,
        hitIsClose: hit !== null && (hit === button || button.contains(hit)),
      };
    })()`)
    if (close === null) {
      skip('sheet.close-hit', 'no close button rendered')
    } else if (close.hitIsClose) {
      pass('sheet.close-hit', `${close.width}x${close.height}`)
    } else {
      fail('sheet.close-hit', 'something paints over the close button centre')
    }

    // Save the rendering for a human: the assertions above are precise but
    // blind to what the sheet looks like. The path is printed so it can be
    // opened directly.
    const shotDir = '/tmp/dsh-cdp-probe'
    await mkdir(shotDir, { recursive: true })
    const shotPath = join(shotDir, 'settings-sheet.png')
    const shot = await client.send('Page.captureScreenshot', { format: 'png' })
    await writeFile(shotPath, Buffer.from(shot.data, 'base64'))
    pass('sheet.screenshot', shotPath)
  } finally {
    client?.close()
    chrome.kill('SIGKILL')
    await rm(profileDir, { recursive: true, force: true }).catch(() => {})
  }

  const failed = results.filter((entry) => entry.status === 'FAIL')
  console.log(`\nSUMMARY pass=${results.filter((e) => e.status === 'PASS').length} fail=${failed.length} skip=${results.filter((e) => e.status === 'SKIP').length}`)
  if (failed.length > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(`probe aborted: ${error.message}`)
  process.exitCode = 1
})

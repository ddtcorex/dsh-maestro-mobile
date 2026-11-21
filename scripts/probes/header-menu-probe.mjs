// CDP probe for the mobile session header's More-actions (ellipsis) menu.
//
// The menu must stay REACHABLE on a phone. That is a product decision with a
// history: this plugin used to hide the control because it carried a single
// entry ("Download session log") that the drawer footer already offers, and the
// hide rule died silently when upstream renamed the trigger class from the
// "moreButton" fragment to "headerMenuButton". 0.2.2 also grew the menu to four
// entries, three of which have no other mobile path (Copy Session as Markdown,
// Open in, Feedback; measured live on 0.2.2-rc.5 at 390px, 2026-11-21), so
// hiding it again would remove actions from the phone. This probe proves the
// button and every entry inside it are painted and hit-testable, which is the
// half a source-text assertion cannot see.
//
// Env: DSH_PROBE_URL (default http://127.0.0.1:3080/),
//      DSH_PROBE_SESSION_ID (required: a session to open, any real one),
//      DSH_PROBE_CHROME (default chromium; the snap stub never launches, pass
//        the real binary), DSH_PROBE_TIMEOUT_MS (default 30000).
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
const MENU_TRIGGER = '[data-slot="conversation.session.header"] button[data-context-menu-trigger]'
const MENU_SURFACE = '[role="menu"]'
const MENU_ITEMS = '[role="menu"] [role="menuitem"], [role="menu"] button'
// When the hide decision was taken the menu carried one entry. Three is the
// floor that keeps this a real assertion without pinning upstream's exact list.
const MIN_ENTRIES = 3

const results = []
const report = (status, name, detail = '') => {
  results.push({ status, name, detail })
  console.log(`${status} ${name}${detail ? ` ${detail}` : ''}`)
}
const pass = (name, detail = '') => report('PASS', name, detail)
const fail = (name, detail = '') => report('FAIL', name, detail)

function readConfig(env = process.env) {
  const sessionId = env.DSH_PROBE_SESSION_ID?.trim()
  if (!sessionId) throw new Error('DSH_PROBE_SESSION_ID is required')
  const parsedUrl = new URL(env.DSH_PROBE_URL || DEFAULT_URL)
  const timeoutMs = Number(env.DSH_PROBE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error('DSH_PROBE_TIMEOUT_MS must be a positive integer')
  return { url: parsedUrl.href, sessionId, chromePath: env.DSH_PROBE_CHROME || 'chromium', timeoutMs }
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function connect(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let target
  while (Date.now() < deadline) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      target = list.find((candidate) => candidate.type === 'page')
      if (target?.webSocketDebuggerUrl) break
    } catch { /* browser still booting */ }
    await sleep(100)
  }
  if (target === undefined) throw new Error(`chrome target never appeared on ${port}`)
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true })
  })
  let nextId = 0
  const pending = new Map()
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id === undefined) return
    const request = pending.get(message.id)
    if (request === undefined) return
    pending.delete(message.id)
    message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result)
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text)
    }
    return response.result.value
  }
  return { send, evaluate, close: () => ws.close() }
}

async function waitFor(label, timeoutMs, probe) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await probe()
    if (value) return value
    await sleep(100)
  }
  throw new Error(`${label} timed out after ${timeoutMs}ms`)
}

/** Read the trigger's paint state and whether its own centre lands on it. */
async function readTrigger(client) {
  return client.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(MENU_TRIGGER)});
    if (el === null) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const hit = r.width > 0 && r.height > 0
      ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      : null;
    return {
      aria: el.getAttribute('aria-label'),
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
      reachable: hit !== null && (hit === el || el.contains(hit)),
      hitTag: hit === null ? 'none' : hit.tagName,
    };
  })()`)
}

async function readMenu(client) {
  return client.evaluate(`(() => {
    const surface = document.querySelector(${JSON.stringify(MENU_SURFACE)});
    if (surface === null) return { open: false };
    const items = [...document.querySelectorAll(${JSON.stringify(MENU_ITEMS)})]
      .filter((el) => !el.disabled);
    const described = items.map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const hit = r.width > 0 && r.height > 0
        ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        : null;
      return {
        text: (el.textContent || '').trim().slice(0, 40),
        rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
        painted: r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden',
        reachable: hit !== null && (hit === el || el.contains(hit)),
        inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
      };
    });
    const box = surface.getBoundingClientRect();
    return { open: true, items: described, box: [Math.round(box.width), Math.round(box.height)] };
  })()`)
}

async function main() {
  const config = readConfig()
  const port = await allocatePort()
  const userDataDir = await mkdtemp(join(tmpdir(), 'dsh-header-menu-'))
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
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try { localStorage.setItem('dsh.sessions.current', ${JSON.stringify(JSON.stringify({ sessionId: config.sessionId }))}) } catch {}`,
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
      fail('header-menu.frame', 'mobile shell never armed (frame marker + coarse pointer + plugin stylesheet)')
      return
    }
    pass('header-menu.frame', 'mobile shell armed at 390px with a coarse pointer')

    const trigger = await waitFor('header menu trigger', config.timeoutMs, async () => {
      try {
        return await readTrigger(client)
      } catch {
        return null
      }
    }).catch(() => null)
    if (trigger === null) {
      fail('header-menu.trigger', 'no [data-context-menu-trigger] in the session header (upstream may have renamed it)')
      return
    }
    const painted = trigger.display !== 'none' && trigger.visibility !== 'hidden' && trigger.opacity !== '0'
    if (painted && trigger.reachable) {
      pass('header-menu.trigger', `${trigger.aria ?? 'menu'} painted ${trigger.rect[2]}x${trigger.rect[3]} at ${trigger.rect[0]},${trigger.rect[1]}`)
    } else {
      fail('header-menu.trigger', `display=${trigger.display} visibility=${trigger.visibility} opacity=${trigger.opacity} reachable=${trigger.reachable} (hit ${trigger.hitTag})`)
    }

    // Open it through its own click: a synthetic tap on iOS-shaped DOM is the
    // path that already bit this plugin once (the host dismisses on blur), so
    // the probe keeps the assertion on what the menu contains, not on how a
    // finger reaches it.
    await client.evaluate(`document.querySelector(${JSON.stringify(MENU_TRIGGER)})?.click()`)
    const menu = await waitFor('menu surface', 5_000, async () => {
      try {
        const state = await readMenu(client)
        return state.open ? state : null
      } catch {
        return null
      }
    }).catch(() => null)
    if (menu === null) {
      fail('header-menu.entries', 'the menu did not open on a plain click')
      return
    }
    const count = menu.items.length
    const broken = menu.items.filter((item) => !item.painted || !item.reachable || !item.inViewport || item.text === '')
    if (count >= MIN_ENTRIES && broken.length === 0) {
      pass('header-menu.entries', `${count} entries, all painted and reachable: ${menu.items.map((item) => item.text).join(' | ')}`)
    } else if (count < MIN_ENTRIES) {
      fail('header-menu.entries', `only ${count} entries (want at least ${MIN_ENTRIES}): ${menu.items.map((item) => item.text).join(' | ')}`)
    } else {
      fail('header-menu.entries', `${broken.length} unusable entries: ${JSON.stringify(broken[0])}`)
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
  fail('header-menu.probe', error instanceof Error ? error.message : String(error))
}

const failures = results.filter((row) => row.status === 'FAIL')
console.log(failures.length === 0
  ? `header-menu probe: ${results.filter((row) => row.status === 'PASS').length} passed`
  : `header-menu probe: ${failures.length} failed`)
if (failures.length > 0) process.exitCode = 1

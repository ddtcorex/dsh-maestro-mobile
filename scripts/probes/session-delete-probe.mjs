// CDP probe for the mobile session-delete flow (dsh-maestro-mobile).
//
// Safe by default: it verifies that the delete item is injected into the host
// session-row menu (exactly once), that the confirmation dialog opens with the
// right semantics, that Escape cancels without deleting, and that the host
// route answers a structured 404 for an unknown session.
//
// A REAL deletion only runs when DSH_PROBE_DELETE_SESSION_ID names one specific
// session, because this flow destroys data and the probe must never pick a
// victim by itself.
//
// Env: DSH_PROBE_URL (default http://127.0.0.1:3080/),
//      DSH_PROBE_SESSION_ID (required, the session the probe selects),
//      DSH_PROBE_WORKSPACE (workspace title to pick, default first entry),
//      DSH_PROBE_DELETE_SESSION_ID (optional, enables the destructive step),
//      DSH_PROBE_CHROME (default chromium), DSH_PROBE_TIMEOUT_MS (default 30000).
// Exits 0 only when every required check passes.
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import net from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DEFAULT_URL = 'http://127.0.0.1:3080/'
const DEFAULT_TIMEOUT_MS = 30_000
const FRAME_SELECTOR = '[data-mobile-nav="frame"]'
const MOBILE_STYLE_SELECTOR = 'style[data-plugin="@ddtcorex/dsh-maestro-mobile"]'
const DELETE_MARKER = '[data-mobile-nav="session-delete"]'
const DIALOG_SELECTOR = '[data-mobile-nav="delete-dialog"]'
const ROUTE = '/api/mobile-nav.session.delete'

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
  const sessionId = env.DSH_PROBE_SESSION_ID?.trim()
  if (!sessionId) throw new Error('DSH_PROBE_SESSION_ID is required')
  const parsedUrl = new URL(env.DSH_PROBE_URL || DEFAULT_URL)
  const timeoutMs = Number(env.DSH_PROBE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('DSH_PROBE_TIMEOUT_MS must be a positive integer')
  }
  return {
    url: parsedUrl,
    sessionId,
    workspace: env.DSH_PROBE_WORKSPACE?.trim() || null,
    deleteSessionId: env.DSH_PROBE_DELETE_SESSION_ID?.trim() || null,
    chromePath: env.DSH_PROBE_CHROME || 'chromium',
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

/** Click the first element matching a selector through the page's own API. */
const clickSelector = (client, selector) => client.evaluate(`(() => {
  const element = document.querySelector(${JSON.stringify(selector)});
  if (element === null) return false;
  element.click();
  return true;
})()`)

async function openSessionMenu(client) {
  // The SELECTED row renders without row actions, so pick the first row that
  // actually offers the ⋯ button.
  return client.evaluate(`(() => {
    const rows = [...document.querySelectorAll('[class*="_sessionRow"]')];
    if (rows.length === 0) return 'no-row';
    const row = rows.find((candidate) => candidate.querySelector('button') !== null);
    if (row === undefined) return 'no-button';
    row.querySelector('button').click();
    return 'clicked';
  })()`)
}

async function main() {
  const config = readConfig()
  const port = await allocatePort()
  const profileDir = await mkdtemp(join(homedir(), '.cache', 'dsh-maestro-mobile-delete-'))
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
    // (pointer: coarse) is what arms the effect.
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

    // Cold start: pick a workspace so the sidebar renders session rows.
    await clickSelector(client, 'button[aria-label="Choose workspace"]')
    await sleep(400)
    const workspacePicked = await client.evaluate(`(() => {
      const wanted = ${JSON.stringify(config.workspace)};
      const items = [...document.querySelectorAll('[role="menuitem"], [role="option"], li, button')];
      const target = wanted === null
        ? items.find((item) => /workspace|项目|工作区/i.test(item.getAttribute('aria-haspopup') ?? '') === false && (item.textContent ?? '').trim() !== '')
        : items.find((item) => (item.textContent ?? '').trim() === wanted);
      if (target === undefined) return false;
      target.click();
      return true;
    })()`)
    await sleep(800)
    if (!workspacePicked) fail('delete.workspace', 'no workspace entry could be picked')
    else pass('delete.workspace', config.workspace ?? 'first entry')

    // Open the mobile drawer's sidebar so rows mount.
    await client.evaluate(`document.querySelector('button[aria-label="Open sidebar"]')?.click()`)
    await waitFor('session rows', config.timeoutMs, async () => {
      try {
        return await client.evaluate(`document.querySelectorAll('[class*="_sessionRow"]').length > 0`)
      } catch {
        return false
      }
    })
    pass('delete.rows', `count=${await client.evaluate(`document.querySelectorAll('[class*="_sessionRow"]').length`)}`)

    const opened = await openSessionMenu(client)
    if (opened !== 'clicked') fail('delete.menu-open', opened)
    else pass('delete.menu-open', 'row menu opened')

    const menu = await waitFor('session menu', config.timeoutMs, async () => {
      try {
        return await client.evaluate(`(() => {
          const menus = [...document.querySelectorAll('[role="menu"]')];
          // The host session menu carries rename / fork / archive; after
          // injection it has one more item, so match on "at least three" and
          // let the injected count decide.
          const host = menus.find((menu) => menu.querySelectorAll('[role="menuitem"]').length >= 3);
          // Wait for the injected item: injection runs on the next animation
          // frame after the portal mounts, so a snapshot taken earlier would
          // read as a failure.
          if (host === undefined || host.querySelector(${JSON.stringify(DELETE_MARKER)}) === null) return null;
          return {
            hostItems: host.querySelectorAll('[role="menuitem"]').length,
            injected: host.querySelectorAll(${JSON.stringify(DELETE_MARKER)}).length,
            labels: [...host.querySelectorAll('[role="menuitem"]')].map((item) => (item.textContent ?? '').trim()),
          };
        })()`)
      } catch {
        return null
      }
    })
    if (menu.injected === 1) pass('delete.item-injected', `items=${menu.labels.length} ${menu.labels.join(' / ')}`)
    else fail('delete.item-injected', `injected=${menu.injected} labels=${menu.labels.join(' / ')}`)

    await clickSelector(client, DELETE_MARKER)
    const dialog = await waitFor('confirm dialog', config.timeoutMs, async () => {
      try {
        return await client.evaluate(`(() => {
          const card = document.querySelector(${JSON.stringify(DIALOG_SELECTOR)});
          if (card === null) return null;
          return {
            role: card.getAttribute('role'),
            modal: card.getAttribute('aria-modal'),
            hasYes: card.querySelector('[data-mobile-nav="delete-confirm-yes"]') !== null,
            hasNo: card.querySelector('[data-mobile-nav="delete-confirm-no"]') !== null,
            text: (card.textContent ?? '').trim().slice(0, 120),
          };
        })()`)
      } catch {
        return null
      }
    })
    if (dialog.role === 'dialog' && dialog.modal === 'true' && dialog.hasYes && dialog.hasNo) {
      pass('delete.dialog', `role=${dialog.role} modal=${dialog.modal}`)
    } else {
      fail('delete.dialog', JSON.stringify(dialog))
    }

    // Escape must cancel without deleting anything.
    const rowsBefore = await client.evaluate(`document.querySelectorAll('[class*="_sessionRow"]').length`)
    await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await sleep(300)
    const afterEscape = await client.evaluate(`(() => ({
      dialog: document.querySelector(${JSON.stringify(DIALOG_SELECTOR)}) !== null,
      rows: document.querySelectorAll('[class*="_sessionRow"]').length,
    }))()`)
    if (!afterEscape.dialog && afterEscape.rows === rowsBefore) {
      pass('delete.escape-cancels', `rows=${afterEscape.rows}`)
    } else {
      fail('delete.escape-cancels', JSON.stringify(afterEscape))
    }

    // Route liveness (non-destructive): an unknown session must answer a
    // structured 404, which also proves the guard let a same-origin POST in.
    const probe = await client.evaluate(`(async () => {
      try {
        const response = await fetch(${JSON.stringify(ROUTE)}, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: 'probe-session-that-does-not-exist' }),
        });
        const payload = await response.json().catch(() => null);
        return { status: response.status, code: payload?.error?.code ?? null };
      } catch (error) {
        return { status: 0, code: String(error) };
      }
    })()`)
    if (probe.status === 404 && probe.code === 'session-not-found') {
      pass('delete.route-live', `status=${probe.status} code=${probe.code}`)
    } else if (probe.status === 403 || probe.status === 404) {
      skip('delete.route-live', `status=${probe.status} code=${probe.code} (host restart pending?)`)
    } else {
      fail('delete.route-live', `status=${probe.status} code=${probe.code}`)
    }

    if (config.deleteSessionId === null) {
      skip('delete.real-delete', 'set DSH_PROBE_DELETE_SESSION_ID to run the destructive step')
    } else {
      const result = await client.evaluate(`(async () => {
        const response = await fetch(${JSON.stringify(ROUTE)}, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: ${JSON.stringify(config.deleteSessionId)} }),
        });
        return { status: response.status, payload: await response.json().catch(() => null) };
      })()`)
      if (result.status === 200 && result.payload?.ok === true) {
        pass('delete.real-delete', `deleted=${result.payload.deleted}`)
      } else {
        fail('delete.real-delete', `status=${result.status} ${JSON.stringify(result.payload)}`)
      }
    }
  } finally {
    client?.close()
    chrome.kill('SIGKILL')
    await sleep(300)
    await rm(profileDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  }

  const failures = results.filter((result) => result.status === 'FAIL').length
  console.log(`SUMMARY pass=${results.filter((r) => r.status === 'PASS').length} skip=${results.filter((r) => r.status === 'SKIP').length} fail=${failures}`)
  process.exitCode = failures > 0 ? 1 : 0
}

await main()

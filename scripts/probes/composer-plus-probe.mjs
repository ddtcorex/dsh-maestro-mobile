// CDP probe for the composer "+" command menu (dsh-maestro-mobile).
//
// Guards the regression the host cannot fix by itself: the "+" opens the command
// menu, but a SECOND tap must close it. Upstream's `toggleSource()` close branch
// is unreachable because the button's onClick focuses the editor first, which
// re-tracks and clears the launcher (see src/client/effects/composer-plus-toggle.ts
// for the file:line trace). With the effect installed the second tap sends the
// host its own closing Escape; without it the menu simply stays open — which is
// exactly what this probe asserts, and why it fails on the pre-fix bundle.
//
// The same button's focus/IME half is reported as INFO, never as a gate: headless
// Chrome's synthesized touch hands DOM focus to the button (which the host's
// caret span does not survive), so the focus timeline here is evidence, and the
// phone check in docs/upstream/upgrade-runbook.md §5 stays authoritative for the
// keyboard itself.
//
// Env: DSH_PROBE_URL (default http://127.0.0.1:3082/?token=…),
//      DSH_PROBE_SESSION_ID (required), DSH_PROBE_CHROME (default chromium),
//      DSH_PROBE_TIMEOUT_MS (default 30000).
// Exits 0 only when every check passes.
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import net from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DEFAULT_URL = 'http://127.0.0.1:3082/'
const DEFAULT_TIMEOUT_MS = 30_000
const ADD_SELECTOR = '[data-composer-card] button[aria-haspopup="listbox"]'
const MENU_SELECTOR = '[data-trigger-menu]'

const results = []
const report = (status, name, detail = '') => {
  results.push({ status, name, detail })
  console.log(`${status} ${name}${detail ? ` ${detail}` : ''}`)
}
const pass = (name, detail = '') => report('PASS', name, detail)
const fail = (name, detail = '') => report('FAIL', name, detail)
const info = (name, detail = '') => report('INFO', name, detail)

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

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep(ms)))

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

/** Is the command menu painted right now? */
const MENU_STATE = `(() => {
  const visible = (element) => {
    if (element === null) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const menus = [...document.querySelectorAll(${JSON.stringify(MENU_SELECTOR)})];
  const add = document.querySelector(${JSON.stringify(ADD_SELECTOR)});
  return {
    addPresent: visible(add),
    addDisabled: add === null ? null : add.disabled === true,
    editor: document.querySelector('[data-composer-input]') !== null,
    phase: document.querySelector('[data-composer-card]')?.closest('[data-phase]')?.getAttribute('data-phase') ?? null,
    menus: menus.length,
    visible: menus.some(visible),
  };
})()`

const menuState = (client) => client.evaluate(MENU_STATE)

/**
 * Tap "+" the way the page receives it on a phone.
 *
 * Deliberately a synthetic `element.click()`, NOT `Input.dispatchTouchEvent`:
 * measured on this host, headless Chrome's synthesized touch moves DOM focus to
 * the button, and the host's `keyboard.caretSpan()` does not survive that blur,
 * so a real-touch probe cannot even open the menu (it fails on a correct build
 * too). A phone keeps the editable focused, which is the state the launcher
 * needs. The click path below is exactly what the host's React `onClick` and
 * this plugin's capture/bubble pair observe, so it is still a faithful gate for
 * the open/close contract.
 */
const clickAdd = (client) =>
  client.evaluate(`(() => {
    const add = document.querySelector(${JSON.stringify(ADD_SELECTOR)});
    if (add === null) return false;
    add.click();
    return true;
  })()`)

/**
 * The editor-focus face of the same button, reported as INFO only: the soft
 * keyboard attaches to whatever holds DOM focus, but the host re-focuses the
 * editor on its own schedule (observed again after the release ladder ends), so
 * this cannot discriminate a fix from a regression headless. It is recorded as
 * evidence, not as a gate — the IME behaviour itself is verified on a phone
 * (docs/upstream/upgrade-runbook.md §5).
 */
const FOCUS_STATE = `(() => {
  const editor = document.querySelector('[data-composer-input]');
  const menus = [...document.querySelectorAll(${JSON.stringify(MENU_SELECTOR)})];
  const visible = (element) => {
    if (element === null) return false;
    const rect = element.getBoundingClientRect();
    return getComputedStyle(element).display !== 'none' && rect.width > 0 && rect.height > 0;
  };
  return {
    editorFocused: editor !== null && document.activeElement === editor,
    menuVisible: menus.some(visible),
  };
})()`

const focusState = (client) => client.evaluate(FOCUS_STATE)

async function main() {
  const url = process.env.DSH_PROBE_URL || DEFAULT_URL
  const sessionId = process.env.DSH_PROBE_SESSION_ID?.trim()
  if (!sessionId) throw new Error('DSH_PROBE_SESSION_ID is required')
  const timeoutMs = Number(process.env.DSH_PROBE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)

  const port = await allocatePort()
  const profileDir = await mkdtemp(join(homedir(), '.cache', 'dsh-mobile-plus-'))
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
    // Phones only: the effect is armed inside installMobileEffect, so the probe
    // must report a coarse pointer or it tests the desktop shell.
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 2, mobile: true, hasTouch: true,
    })
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `localStorage.setItem('dsh.sessions.current', ${JSON.stringify(JSON.stringify({ sessionId }))})`,
    })

    await client.send('Page.navigate', { url })

    // The injected selection is only a shortcut; the authoritative way to a live
    // composer is to drive the UI (workspace picker → drawer → a session row),
    // the same route the session-delete probe takes.
    const reachConversation = async () => {
      await waitFor('mobile plugin boot', timeoutMs, async () => {
        try {
          return await client.evaluate(`matchMedia('(pointer: coarse)').matches
            && document.querySelector('[data-mobile-nav="frame"]') !== null`)
        } catch {
          return false
        }
      })
      const onHero = () =>
        client.evaluate(`document.querySelector('[data-phase="active"]') === null`)
      if (await onHero()) {
        await client.evaluate(`document.querySelector('button[aria-label="Choose workspace"]')?.click()`)
        await sleep(400)
        await client.evaluate(`(() => {
          const items = [...document.querySelectorAll('[role="menuitem"], [role="option"], li, button')];
          const target = items.find((item) => (item.textContent ?? '').trim() !== '');
          if (target === undefined) return false;
          target.click();
          return true;
        })()`)
        await sleep(800)
      }
      if (await onHero()) {
        await client.evaluate(`document.querySelector('button[aria-label="Open sidebar"]')?.click()`)
        await waitFor('session rows', timeoutMs, async () => {
          try {
            return await client.evaluate(`document.querySelectorAll('[class*="_sessionRow"]').length > 0`)
          } catch {
            return false
          }
        })
        await client.evaluate(`(() => {
          const row = [...document.querySelectorAll('[class*="_sessionRow"]')]
            .find((candidate) => (candidate.textContent ?? '').trim() !== '');
          if (row === undefined) return false;
          row.click();
          return true;
        })()`)
      }
      return waitFor('composer in an active session', timeoutMs, async () => {
        try {
          const state = await menuState(client)
          return state.addPresent && state.addDisabled === false ? state : null
        } catch {
          return null
        }
      })
    }

    const armed = await reachConversation()
    pass('composer.present', JSON.stringify(armed))

    const closed = await waitFor('menu closed at rest', timeoutMs, async () => {
      const state = await menuState(client)
      return state.visible ? null : state
    })
    pass('composer.menu-closed-at-rest', `menus=${closed.menus}`)

    /**
     * One tap, then assert the menu settles in the expected state. A timeout is
     * a FAIL, not a thrown error: the pre-fix bundle must reach the bottom of
     * this battery with exactly one failed row, so the probe proves it
     * discriminates instead of dying on its own error path.
     */
    const tapAndExpect = async (label, wantVisible) => {
      try {
        await clickAdd(client)
        const state = await waitFor(label, timeoutMs, async () => {
          const current = await menuState(client)
          return current.visible === wantVisible ? current : null
        })
        pass(label, `menus=${state.menus} visible=${state.visible}`)
        return true
      } catch (error) {
        const state = await menuState(client).catch(() => ({ menus: null, visible: null }))
        fail(label, `${error instanceof Error ? error.message : String(error)} menus=${state.menus} visible=${state.visible}`)
        return false
      }
    }

    // 1st tap: the host opens its menu.
    let ok = await tapAndExpect('composer.plus-opens', true)
    if (ok) {
      // Evidence for the IME half of the fix: the release ladder should take the
      // DOM focus off the editor early, and the host may take it back later —
      // neither state is asserted, because a phone (not this synthetic click)
      // decides whether the IME follows. See FOCUS_STATE and runbook §5.
      const timeline = []
      for (const delay of [200, 800]) {
        await sleep(delay === 200 ? 200 : 600)
        timeline.push({ at: `${delay}ms`, ...(await focusState(client).catch(() => ({}))) })
      }
      info('composer.focus-after-tap', JSON.stringify(timeline))
    }
    // 2nd tap: THE regression gate. Pre-fix the host re-opens instead of closing.
    if (ok) ok = await tapAndExpect('composer.plus-closes', false)
    // 3rd tap: opening must still work (the close takeover must not eat it).
    if (ok) ok = await tapAndExpect('composer.plus-reopens', true)
    // 4th tap: and closing still works on the re-opened menu.
    if (ok) ok = await tapAndExpect('composer.plus-closes-again', false)
  } finally {
    client?.close()
    chrome.kill('SIGKILL')
    await sleep(300)
    await rm(profileDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  }

  const failures = results.filter((entry) => entry.status === 'FAIL').length
  console.log(
    `SUMMARY pass=${results.filter((entry) => entry.status === 'PASS').length} fail=${failures}`
    + ` info=${results.filter((entry) => entry.status === 'INFO').length}`,
  )
  process.exitCode = failures > 0 ? 1 : 0
}

await main()

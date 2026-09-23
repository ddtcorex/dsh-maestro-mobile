// CDP probe for the sidebar panel exit routes (dsh-maestro-mobile).
//
// A global panel ("Plugins", ...) REPLACES the conversation and the host ships
// no way back: PanelRow's onClick is a bare selectPanel(id), and the session
// header (with the drawer toggle) is not rendered on a panel page. This probe
// drives all three exits the plugin adds and asserts the state each leaves
// behind:
//   1. the FAB flips to the "back to conversation" face while a panel is open,
//      and it does not sit on top of any control the panel page renders;
//   2. the system back key (popstate) returns to the conversation;
//   3. re-tapping the already-selected panel row returns to the conversation;
//   4. no stray history entry is left behind by either programmatic exit.
//
// Env: DSH_PROBE_URL (default http://127.0.0.1:3082/),
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
const PANEL_ROW_SELECTOR = '[class*="panelRow"]'
const ACTIVE_ROW_SELECTOR = '[class*="panelRow"][aria-current="page"]'
const FAB_SELECTOR = '[data-mobile-nav="fab"]'

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

/**
 * Panel / FAB / history snapshot. `fabOverlapsPanelControl` walks the panel
 * page's own interactive elements and reports any intersection with the FAB
 * rect — the geometry regression that made the FAB unusable over a panel in the
 * first place (it swallowed taps aimed at the panel head).
 */
const PANEL_STATE = `(() => {
  const round = (n) => Math.round(n);
  const rect = (element) => {
    const box = element.getBoundingClientRect();
    return { x: box.left, y: box.top, w: box.width, h: box.height };
  };
  const overlaps = (a, b) =>
    a.w > 0 && b.w > 0 && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const active = document.querySelector(${JSON.stringify(ACTIVE_ROW_SELECTOR)});
  const fab = document.querySelector(${JSON.stringify(FAB_SELECTOR)});
  const fabRect = fab === null ? null : rect(fab);
  let collisions = 0;
  let sample = null;
  if (fabRect !== null) {
    const main = document.querySelector('[data-mobile-nav="frame"] > :last-child') || document.body;
    for (const control of main.querySelectorAll('button, a[href], input, select, textarea')) {
      if (fab !== null && (control === fab || fab.contains(control))) continue;
      if (control.closest('[data-mobile-nav="frame"] > :first-child') !== null) continue;
      const box = rect(control);
      if (box.w === 0 || box.h === 0) continue;
      if (!overlaps(fabRect, box)) continue;
      collisions += 1;
      if (sample === null) sample = (control.getAttribute('aria-label') || control.textContent || control.tagName).trim().slice(0, 40);
    }
  }
  return {
    frame: document.querySelector('[data-mobile-nav="frame"]') !== null,
    panelActive: active !== null,
    panelLabel: active === null ? null : (active.getAttribute('aria-label') || '').trim(),
    fabPresent: fab !== null,
    fabMode: fab === null ? null : fab.getAttribute('data-mobile-nav-fab-mode'),
    fabLabel: fab === null ? null : fab.getAttribute('aria-label'),
    fabRect: fabRect === null ? null : { x: round(fabRect.x), y: round(fabRect.y), w: round(fabRect.w), h: round(fabRect.h) },
    collisions,
    sample,
    conversation: document.querySelector('[data-phase="active"]') !== null,
    panelEntry: (history.state && history.state.mobilePanelExit === true) || false,
  };
})()`

const panelState = (client) => client.evaluate(PANEL_STATE)

/**
 * Panel state, or a `navigatedAway` marker. Without the exit routes the system
 * back key leaves the page entirely (that IS the bug), and every later CDP
 * evaluate then rejects with "Inspected target navigated or closed" — so the
 * probe must report that as a failed row instead of dying on its own error path.
 */
const safePanelState = (client) =>
  panelState(client).catch(() => ({
    panelActive: null,
    panelEntry: null,
    fabMode: null,
    conversation: null,
    navigatedAway: true,
  }))

const clickSelector = (client, selector) =>
  client.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (element === null) return false;
    element.click();
    return true;
  })()`)

/** Click the first panel row that is not the selected one. */
const clickUnselectedPanelRow = (client) =>
  client.evaluate(`(() => {
    const rows = [...document.querySelectorAll(${JSON.stringify(PANEL_ROW_SELECTOR)})]
      .filter((row) => row.getAttribute('aria-current') !== 'page');
    const row = rows[0];
    if (row === undefined) return null;
    row.click();
    return (row.getAttribute('aria-label') || '').trim();
  })()`)

const openDrawer = async (client, timeoutMs) => {
  const state = await panelState(client)
  if (state.fabMode === 'open-drawer') {
    await client.evaluate(`document.querySelector(${JSON.stringify(FAB_SELECTOR)})?.click()`)
  } else {
    await clickSelector(client, 'button[aria-label="Open sidebar"]')
  }
  await waitFor('drawer open', timeoutMs, async () => {
    const frame = await client.evaluate(`(() => {
      const frame = document.querySelector('[data-mobile-nav="frame"]');
      return frame === null ? null : !frame.hasAttribute('data-sidebar-collapsed');
    })()`)
    return frame === true
  })
}

async function main() {
  const url = process.env.DSH_PROBE_URL || DEFAULT_URL
  const sessionId = process.env.DSH_PROBE_SESSION_ID?.trim()
  if (!sessionId) throw new Error('DSH_PROBE_SESSION_ID is required')
  const timeoutMs = Number(process.env.DSH_PROBE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)

  const port = await allocatePort()
  const profileDir = await mkdtemp(join(homedir(), '.cache', 'dsh-mobile-panel-'))
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
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 2, mobile: true, hasTouch: true,
    })
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `localStorage.setItem('dsh.sessions.current', ${JSON.stringify(JSON.stringify({ sessionId }))})`,
    })
    await client.send('Page.navigate', { url })

    await waitFor('mobile plugin boot', timeoutMs, async () => {
      try {
        return await client.evaluate(`matchMedia('(pointer: coarse)').matches
          && document.querySelector('[data-mobile-nav="frame"]') !== null`)
      } catch {
        return false
      }
    })
    const atRest = await panelState(client)
    pass('panel.starts-closed', JSON.stringify({ panelActive: atRest.panelActive, panelEntry: atRest.panelEntry, conversation: atRest.conversation }))
    if (atRest.panelEntry) fail('panel.no-entry-at-rest', 'a panel exit entry was armed with no panel open')

    /**
     * Wait for a route to land back on the main column the drawer came from.
     * Asserting only "the panel is gone" would pass on a blank column: the
     * previous main column must be restored (hero or conversation, whichever it
     * was) and the FAB must leave its exit face.
     */
    const expectBackFromPanel = async (label) => {
      try {
        const state = await waitFor(label, timeoutMs, async () => {
          const current = await panelState(client)
          // Still inside the app: a page that navigated away would otherwise
          // read as "panel gone, FAB not in exit mode" and pass falsely.
          if (current.frame !== true) return null
          if (current.panelActive) return null
          if (current.conversation !== atRest.conversation) return null
          if (current.fabMode === 'exit-panel' || current.fabMode === null) return null
          return current
        })
        pass(label, `conversation=${state.conversation} fabMode=${state.fabMode} frame=${state.frame}`)
        return true
      } catch (error) {
        const state = await safePanelState(client)
        fail(label, state.navigatedAway
          ? 'the back key left the page: no exit route armed'
          : `${error instanceof Error ? error.message : String(error)} ${JSON.stringify(state)}`)
        return false
      }
    }

    // Route 1: open a panel from the drawer.
    await openDrawer(client, timeoutMs)
    const label = await clickUnselectedPanelRow(client)
    if (label === null) fail('panel.opens', 'no unselected panel row in the drawer')
    else {
      const opened = await waitFor('panel owns the main column', timeoutMs, async () => {
        const state = await panelState(client)
        return state.panelActive ? state : null
      })
      pass('panel.opens', `${label} active=${opened.panelActive} conversation=${opened.conversation}`)
    }

    const withPanel = await waitFor('FAB exit face', timeoutMs, async () => {
      const state = await panelState(client)
      return state.fabMode === 'exit-panel' ? state : null
    }).catch(() => null)
    if (withPanel === null) {
      const state = await panelState(client)
      fail('panel.fab-back-face', JSON.stringify(state))
    } else {
      pass('panel.fab-back-face', `mode=${withPanel.fabMode} label=${withPanel.fabLabel}`)
      if (withPanel.fabLabel === 'Back to conversation') pass('panel.fab-label', withPanel.fabLabel)
      else fail('panel.fab-label', `label=${withPanel.fabLabel}`)
      if (withPanel.collisions === 0) pass('panel.fab-clear-of-controls', `rect=${JSON.stringify(withPanel.fabRect)}`)
      else fail('panel.fab-clear-of-controls', `collisions=${withPanel.collisions} sample=${withPanel.sample}`)
    }

    // Route 2: the system back key leaves the panel. Without an armed entry the
    // browser leaves the page, and this evaluate's own reply is lost with it -
    // that rejection is the bug showing up, so it is swallowed here and the
    // state check below reports it as a row.
    await client.evaluate('history.back()').catch(() => {})
    await expectBackFromPanel('panel.back-exits')
    const afterBack = await safePanelState(client)
    if (afterBack.navigatedAway) fail('panel.back-gives-entry-back', 'the back key left the page: no exit route armed')
    else if (afterBack.panelEntry) fail('panel.back-gives-entry-back', `panelEntry=${afterBack.panelEntry}`)
    else pass('panel.back-gives-entry-back', 'no stray entry')

    // Route 3: re-tap the already-selected panel row.
    await openDrawer(client, timeoutMs)
    const reopened = await clickUnselectedPanelRow(client)
    if (reopened === null) fail('panel.reopens', 'no unselected panel row in the drawer')
    else {
      await waitFor('panel owns the main column again', timeoutMs, async () => {
        const state = await panelState(client)
        return state.panelActive ? state : null
      })
      await openDrawer(client, timeoutMs)
      const retapped = await client.evaluate(`(() => {
        const row = document.querySelector(${JSON.stringify(ACTIVE_ROW_SELECTOR)});
        if (row === null) return false;
        row.click();
        return true;
      })()`)
      if (!retapped) fail('panel.retap-exits', 'no selected panel row to re-tap')
      else await expectBackFromPanel('panel.retap-exits')
    }
    const afterRetap = await safePanelState(client)
    if (afterRetap.navigatedAway) fail('panel.retap-gives-entry-back', 'the page navigated away')
    else if (afterRetap.panelEntry) fail('panel.retap-gives-entry-back', `panelEntry=${afterRetap.panelEntry}`)
    else pass('panel.retap-gives-entry-back', 'no stray entry')
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

await main().catch((error) => {
  fail('fatal', error instanceof Error ? error.message : String(error))
  console.log(`SUMMARY pass=${results.filter((entry) => entry.status === 'PASS').length} fail=${results.filter((entry) => entry.status === 'FAIL').length}`)
  process.exitCode = 1
})

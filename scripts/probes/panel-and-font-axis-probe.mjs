// CDP probe for the drawer panel-row close and the content font-size axis
// (dsh-maestro-mobile).
//
// Both checks are written to FAIL on the pre-fix code, so a green run is
// evidence rather than a tautology:
//   - panel-row: on the old plugin the drawer stayed open when a global panel
//     row was tapped; the probe opens the drawer, taps a real panel row and
//     asserts the drawer actually collapsed.
//   - font-axis: on the old plugin the message rule carried `15px!important`,
//     which beats the host variable. The probe sets --dsh-content-font-size on
//     <body> to a value ABOVE the floor and asserts the COMPUTED font-size of
//     real message prose changes. A grep for the variable would not prove the
//     setting reaches the text; only the computed value does.
//
// Env: DSH_PROBE_URL (default http://127.0.0.1:3080/),
//      DSH_PROBE_SESSION_ID (required), DSH_PROBE_CHROME (default /opt/google/chrome/chrome),
//      DSH_PROBE_TIMEOUT_MS (default 30000).
// Exits 0 only when every check passes.
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import net from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DEFAULT_URL = 'http://127.0.0.1:3080/'
const DEFAULT_CHROME = '/opt/google/chrome/chrome'
const DEFAULT_TIMEOUT_MS = 30_000
const FRAME_SELECTOR = '[data-mobile-nav="frame"]'
const PANEL_ROW_SELECTOR = 'nav[aria-label] button[class*="panelRow"]'

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

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms))

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

const drawerOpen = (client) => client.evaluate(`(() => {
  const frame = document.querySelector(${JSON.stringify(FRAME_SELECTOR)});
  return frame !== null && !frame.hasAttribute('data-sidebar-collapsed');
})()`)

async function main() {
  const url = process.env.DSH_PROBE_URL || DEFAULT_URL
  const sessionId = process.env.DSH_PROBE_SESSION_ID?.trim()
  if (!sessionId) throw new Error('DSH_PROBE_SESSION_ID is required')
  const timeoutMs = Number(process.env.DSH_PROBE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)

  const port = await allocatePort()
  const profileDir = await mkdtemp(join(homedir(), '.cache', 'dsh-mobile-panel-font-'))
  const chrome = spawn(process.env.DSH_PROBE_CHROME || DEFAULT_CHROME, [
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

    // Phone profile + touch emulation: without the latter headless reports
    // (pointer: none) and the whole mobile branch stays dormant.
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 2, mobile: true, hasTouch: true,
    })
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
    await client.send('Page.navigate', { url })
    await waitFor('mobile branch arm', timeoutMs, async () => {
      try {
        const coarse = await client.evaluate(`matchMedia('(pointer: coarse)').matches`)
        const frame = await client.evaluate(`document.querySelector(${JSON.stringify(FRAME_SELECTOR)}) !== null`)
        return coarse && frame
      } catch {
        return false
      }
    })
    pass('setup.mobile-armed', 'coarse=true frame=true')
    // ---------------------------------------------------------------- fix B
    // A conversation with REAL rendered history, then the content font axis.
    //
    // Two waits are load-bearing and each was a red row before:
    //  - a session must actually be OPEN. The injected `dsh.sessions.current` is
    //    only a hint on this host (it is not restored on its own), so the drawer is
    //    the authoritative route - the same drive the composer probe uses;
    //  - the conversation then shows "Loading history..." while the session log is
    //    read, and every prose selector matches nothing until it lands (measured:
    //    the scroll body holding only a `_hint` node with that text). Sampling once
    //    right after the drive measures the placeholder, not the prose.
    //
    // A RUNNING session is skipped on purpose: its label carries the Running prefix
    // and it kept showing the hint 30s in, because the live turn owns the view.
    const proseSelector = '[data-phase] p, [data-phase] [class*="_text_"], [data-phase] li'
    const prosePresent = () =>
      client.evaluate(`document.querySelector(${JSON.stringify(proseSelector)}) !== null`)
    const onHero = () => client.evaluate(`document.querySelector('[data-phase="active"]') === null`)
    const composerReady = () =>
      client.evaluate(`(() => {
        const add = document.querySelector('[data-composer-card] button[aria-haspopup="listbox"]');
        return add !== null && add.disabled === false && document.querySelector('[data-phase="active"]') !== null;
      })()`)
    const sessionRows = () =>
      client.evaluate(`document.querySelectorAll('[class*="_sessionRow"]').length`)

    if (await onHero()) {
      // Cold start: connect a workspace first, or the sidebar renders no sessions.
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
    if (!(await drawerOpen(client))) {
      await client.evaluate(`document.querySelector('button[aria-label="Open sidebar"]')?.click()`)
      await waitFor('drawer open for the session drive', timeoutMs, () => drawerOpen(client)).catch(() => null)
    }
    if (!(await drawerOpen(client))) {
      await client.evaluate(`document.querySelector('[data-mobile-nav="fab"], [data-mobile-nav="toggle"]')?.click()`)
      await waitFor('drawer open for the session drive (plugin opener)', timeoutMs, () => drawerOpen(client)).catch(() => null)
    }
    if (!(await drawerOpen(client))) {
      fail('font-axis.drawer', 'the drawer did not open with either opener')
    } else {
      const waitRows = () => waitFor('session rows', timeoutMs, async () => {
        try {
          return (await sessionRows()) > 0
        } catch {
          return false
        }
      }).catch(() => null)
      await waitRows()
      if ((await sessionRows()) === 0) {
        // No workspace is connected yet, so the sidebar is listing workspaces
        // instead of sessions: pick one, then the rows appear. Measured state:
        // treeitems=14 workspace entries and sessionRows=0.
        const workspace = await client.evaluate(`(() => {
          const rows = [...document.querySelectorAll('[role="treeitem"]')]
            .filter((row) => !/New Session/i.test(row.textContent || ''));
          const row = rows[0];
          if (row === undefined) return null;
          row.click();
          return (row.textContent || '').trim().slice(0, 30);
        })()`)
        if (workspace === null) fail('font-axis.workspace-picked', 'no workspace row in the drawer')
        else pass('font-axis.workspace-picked', workspace)
        await sleep(600)
        await waitRows()
      }
      const picked = await client.evaluate(`(() => {
        const rows = [...document.querySelectorAll('[class*="_sessionRow"]')];
        const usable = rows.filter((candidate) => (candidate.textContent ?? '').trim() !== '' && candidate.querySelector('button') !== null);
        const row = usable.find((candidate) => !/^Running/.test((candidate.textContent ?? '').trim())) ?? usable[0];
        if (row === undefined) return { rows: rows.length, picked: null };
        row.click();
        return { rows: rows.length, picked: (row.textContent ?? '').trim().slice(0, 40) };
      })()`)
      if (picked.picked === null) fail('font-axis.session-picked', `no row with a row action (rows=${picked.rows})`)
      else pass('font-axis.session-picked', picked.picked)
    }
    // Leave the drawer so the conversation column, not the rail, holds the width.
    await client.evaluate(`document.querySelector('[data-mobile-nav="backdrop"]')?.click()`)
    await sleep(300)
    try {
      await waitFor('composer in an active session', timeoutMs, composerReady)
      pass('font-axis.session-open', 'composer enabled in an active session')
    } catch (error) {
      fail('font-axis.session-open', error instanceof Error ? error.message : String(error))
    }
    const historyTimeoutMs = Number(process.env.DSH_PROBE_HISTORY_TIMEOUT_MS || 30_000)
    try {
      await waitFor('session history', historyTimeoutMs, () => prosePresent())
      pass('font-axis.history-loaded', `prose within ${historyTimeoutMs}ms`)
    } catch {
      const hint = await client.evaluate(`(() => {
        const node = document.querySelector('[class*="_scrollBody"] [class*="_hint"]');
        return node === null ? null : (node.textContent || '').trim().slice(0, 40);
      })()`).catch(() => null)
      fail('font-axis.history-loaded', `no prose after ${historyTimeoutMs}ms (flow shows ${hint === null ? 'nothing' : JSON.stringify(hint)})`)
    }

    const axis = await client.evaluate(`(() => {
      const body = document.body;
      const set = (value) => body.style.setProperty('--dsh-content-font-size', value);
      set('14px');
      const p = document.querySelector(${JSON.stringify(proseSelector)});
      const computedBefore = p === null ? null : getComputedStyle(p).fontSize;
      set('22px');
      const computedAfter = p === null ? null : getComputedStyle(p).fontSize;
      body.style.removeProperty('--dsh-content-font-size');
      return {
        hasProse: p !== null,
        element: p === null ? null : (p.className || p.tagName),
        computedBefore,
        computedAfter,
      };
    })()`)

    if (!axis.hasProse) {
      fail('font-axis.prose-present', 'no message prose found to measure')
    } else {
      pass('font-axis.prose-present', `${axis.element}`)
      const before = Number.parseFloat(axis.computedBefore)
      const after = Number.parseFloat(axis.computedAfter)
      if (after > before) pass('font-axis.follows-setting', `${axis.computedBefore} -> ${axis.computedAfter}`)
      else fail('font-axis.follows-setting', `axis ignored: ${axis.computedBefore} -> ${axis.computedAfter}`)
      // The floor must hold: a setting BELOW it must not shrink prose.
      const floored = await client.evaluate(`(() => {
        const body = document.body;
        body.style.setProperty('--dsh-content-font-size', '8px');
        const p = document.querySelector(${JSON.stringify(proseSelector)});
        const size = p === null ? null : getComputedStyle(p).fontSize;
        body.style.removeProperty('--dsh-content-font-size');
        return size;
      })()`)
      const floorValue = Number.parseFloat(floored)
      if (floorValue >= 15) pass('font-axis.floor-holds', `${floored} >= 15px`)
      else fail('font-axis.floor-holds', `prose shrank below the floor: ${floored}`)
    }

    // ---------------------------------------------------------------- fix A
    // Open the drawer, then tap a REAL panel row through the DOM click path the
    // plugin's capture listener observes: the drawer must collapse so the panel
    // gets the whole screen.
    if (!(await drawerOpen(client))) {
      await client.evaluate(`document.querySelector('button[aria-label="Open sidebar"], [data-mobile-nav="fab"], [data-mobile-nav="toggle"]')?.click()`)
      await waitFor('drawer open for the panel row', timeoutMs, () => drawerOpen(client))
    }
    const rowCount = await client.evaluate(`document.querySelectorAll(${JSON.stringify(PANEL_ROW_SELECTOR)}).length`)
    if (rowCount === 0) {
      fail('panel-close.row-present', 'no sidebar panel row on this host/state')
    } else {
      pass('panel-close.row-present', `rows=${rowCount}`)
      const beforeTap = await drawerOpen(client)
      if (!beforeTap) fail('panel-close.precondition', 'drawer not open before the tap')
      else pass('panel-close.precondition', 'drawer open')
      const tapped = await client.evaluate(`(() => {
        const row = [...document.querySelectorAll(${JSON.stringify(PANEL_ROW_SELECTOR)})].find((candidate) => candidate.getAttribute('aria-label') !== null) ?? document.querySelector(${JSON.stringify(PANEL_ROW_SELECTOR)});
        if (row === null) return null;
        row.click();
        return row.getAttribute('aria-label');
      })()`)
      if (tapped === null) fail('panel-close.tap', 'no panel row to tap')
      else {
        try {
          await waitFor('drawer collapsed after the panel tap', timeoutMs, async () => !(await drawerOpen(client)))
          pass('panel-close.drawer-collapsed', `panel=${tapped}`)
        } catch {
          fail('panel-close.drawer-collapsed', `drawer stayed open after tapping ${tapped}`)
        }
      }
    }

    // ------------------------------------------------- fix C: the FAB on a panel
    // A global panel replaces the conversation and renders no session header, so
    // the FAB is the only way back: it must be present, in its exit face, named for
    // what it does, and clear of the panel's own controls (it moved to the top-left
    // corner for that).
    const fabState = await client.evaluate(`(() => {
      const overlaps = (a, b) => a.width > 0 && b.width > 0
        && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const fab = document.querySelector('[data-mobile-nav="fab"]');
      const panelOpen = document.querySelector('[data-plugin-panel]') !== null
        || document.querySelector('nav[aria-label] button[aria-current="page"]') !== null;
      let collisions = 0;
      if (fab !== null) {
        const box = fab.getBoundingClientRect();
        const scope = document.querySelector('[data-plugin-panel]') || document;
        for (const control of scope.querySelectorAll('button, a[href], input, select, textarea')) {
          if (fab.contains(control)) continue;
          const other = control.getBoundingClientRect();
          if (other.width === 0 || other.height === 0) continue;
          if (overlaps(box, other)) collisions += 1;
        }
      }
      return {
        panelOpen,
        fab: fab !== null,
        mode: fab === null ? null : fab.getAttribute('data-mobile-nav-fab-mode'),
        label: fab === null ? null : fab.getAttribute('aria-label'),
        collisions,
      };
    })()`)
    if (!fabState.panelOpen) {
      fail('panel-fab.panel-open', 'no panel detected after the tap')
    } else if (!fabState.fab || fabState.mode !== 'exit-panel') {
      fail('panel-fab.back-face', `panel has no way back: fab=${fabState.fab} mode=${fabState.mode}`)
    } else if (fabState.label !== 'Back to conversation') {
      fail('panel-fab.back-face', `label=${fabState.label}`)
    } else if (fabState.collisions > 0) {
      fail('panel-fab.back-face', `overlaps ${fabState.collisions} panel control(s)`)
    } else {
      pass('panel-fab.back-face', `mode=${fabState.mode} label=${fabState.label}`)
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

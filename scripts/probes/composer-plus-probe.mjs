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
// The same button's focus half IS gated here as far as headless allows: while the
// menu is open the editor must not hold DOM focus (the host's programmatic
// focus() is shadowed), and after the interaction that shadow must be gone so the
// editor can be focused again. The IME itself cannot be emulated - the phone check
// in docs/upstream/upgrade-runbook.md §5 stays authoritative for it.
//
// The last three rows gate the retained focus the phone reported after that: with
// the keyboard dismissed iOS keeps the composer editable as the focused element,
// and the next tap on "+" makes WebKit show the keyboard for it - nothing is
// focused at that moment, so the focus shadow cannot stop it. They run under an
// iPhone user agent (composer-focus-release.ts arms only where detectIosWebKit()
// answers true) and FAIL on a build without the release: no marker, focus kept.
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
 * The editor-focus face of the same button. The soft keyboard attaches to
 * whatever holds DOM focus, so "menu open AND the editor does not hold focus"
 * is the headless statement of "tapping + did not raise the keyboard". It only
 * became a gate once the host's programmatic focus() was shadowed: before that
 * the host re-focused the editor within a frame and the row could never pass.
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
  // The release rows poll for a state a correct build reaches in one frame; the
  // short cap keeps an A/B run against the pre-fix build from stalling on them.
  const releaseRowTimeoutMs = Math.min(timeoutMs, 6000)

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
    // Every row below is an iOS row: composer-focus-release.ts arms only where
    // detectIosWebKit() answers true, and that reads the user agent. Chrome's own
    // UA would leave the release effect uninstalled and the last two rows would
    // assert nothing.
    await client.send('Emulation.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
    })
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
      // The keyboard half of the fix: while the menu is on screen the editor must
      // NOT hold DOM focus, because on iOS the keyboard follows DOM focus and a
      // later blur does not take it back. This is the strongest headless
      // statement of "tapping + does not raise the keyboard" - the IME itself
      // still needs a device pass (runbook §5).
      // Sampled at a FIXED moment, after the last release tick (640ms), because
      // the steady state is what matters: a wait-until-unfocused loop would pass
      // on the release ladder alone (each blur makes the editor unfocused for an
      // instant before the host focuses it again) and would never prove the
      // shadow. At 900ms the only thing that can keep the editor unfocused is
      // the host's own focus() being neutralised.
      await sleep(900)
      const held = await focusState(client).catch(() => null)
      if (held !== null && held.menuVisible && !held.editorFocused) {
        pass('composer.plus-keeps-editor-unfocused', `at 900ms ${JSON.stringify(held)}`)
      } else {
        fail('composer.plus-keeps-editor-unfocused', `at 900ms ${JSON.stringify(held)}`)
      }
    }
    // 2nd tap: THE regression gate. Pre-fix the host re-opens instead of closing.
    if (ok) ok = await tapAndExpect('composer.plus-closes', false)
    // 3rd tap: opening must still work (the close takeover must not eat it).
    if (ok) ok = await tapAndExpect('composer.plus-reopens', true)
    // 4th tap: and closing still works on the re-opened menu.
    if (ok) ok = await tapAndExpect('composer.plus-closes-again', false)

    // The "typing" state: keyboard UP, editor focused. Tapping "+" here must NOT
    // release the focus, because the keyboard is the composer's floor - blurring
    // it starts the hide animation and the row slides down under the finger (the
    // jump reported on iOS for the FIRST tap only). The keyboard is faked by
    // shrinking the visual viewport, which is exactly what the plugin reads.
    const emulated = await client.evaluate(`(() => {
      const editor = document.querySelector('[data-composer-input]');
      if (editor === null) return { editor: false };
      const original = Object.getOwnPropertyDescriptor(window, 'visualViewport') || null;
      window.__dshProbeViewport = original;
      const height = Math.max(1, window.innerHeight - 320);
      Object.defineProperty(window, 'visualViewport', {
        configurable: true,
        value: { height, scale: 1, width: window.innerWidth, offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0,
          addEventListener() {}, removeEventListener() {} },
      });
      editor.focus();
      return { editor: true, original: original !== null, focused: document.activeElement === editor, height };
    })()`)
    if (emulated.editor !== true || emulated.focused !== true) {
      fail('composer.plus-keeps-focus-when-keyboard-up', `could not set up the typing state ${JSON.stringify(emulated)}`)
    } else {
      await clickAdd(client)
      const opened2 = await waitFor('menu open in the typing state', timeoutMs, async () => {
        const state = await menuState(client)
        return state.visible ? state : null
      }).catch(() => null)
      const focusAfter = await focusState(client).catch(() => null)
      if (opened2 === null) fail('composer.plus-keeps-focus-when-keyboard-up', 'the menu did not open')
      else if (focusAfter === null || focusAfter.editorFocused !== true) {
        fail('composer.plus-keeps-focus-when-keyboard-up', `the tap released the focus ${JSON.stringify(focusAfter)}`)
      } else {
        pass('composer.plus-keeps-focus-when-keyboard-up', `keyboard inset ${emulated.height}px, editor still focused, menu open`)
      }
      // Close the menu again and put the real viewport back.
      await clickAdd(client)
      await waitFor('menu closed after the typing-state tap', timeoutMs, async () => {
        const state = await menuState(client)
        return state.visible ? null : state
      }).catch(() => null)
      // Chrome exposes visualViewport on the prototype, so there is usually no
      // own descriptor to put back: deleting the stub is the restore. Leaving it
      // behind reads as "keyboard up" for the rest of the run and silently
      // disarms every later focus row.
      await client.evaluate(`(() => {
        const original = window.__dshProbeViewport;
        delete window.__dshProbeViewport;
        if (original !== null && original !== undefined) Object.defineProperty(window, 'visualViewport', original);
        else delete window.visualViewport;
      })()`)
    }

    // The override must lift: a guard that never disarms is worse than the bug it
    // fixes (the editor could never be focused again - the community plugin
    // shipped exactly that). Focusing the editor programmatically must work.
    const restored = await client.evaluate(`(() => {
      const editor = document.querySelector('[data-composer-input]');
      if (editor === null) return { editor: false };
      editor.focus();
      return { editor: true, focused: document.activeElement === editor };
    })()`)
    if (restored.editor === true && restored.focused === true) {
      pass('composer.editor-focus-restored', 'programmatic focus works after the interaction')
    } else {
      fail('composer.editor-focus-restored', JSON.stringify(restored))
    }

    // --- the retained focus (the phone's "first tap still opens the keyboard") --
    // iOS keeps the editable as the focused element with the keyboard dismissed,
    // and WebKit shows the keyboard for that retained focus on the next tap -
    // nothing is focused at that moment, so the focus shadow cannot stop it.
    // composer-focus-release.ts releases it while the keyboard is hidden; these
    // rows are the gate, and they FAIL on the pre-fix build (no marker, focus
    // retained).

    // The rows below are only meaningful with the keyboard DOWN (that is the
    // state the phone is in when it taps "+"); the typing scene faked a keyboard
    // by shrinking the visual viewport, so the real one is restored and reported
    // first rather than assumed.
    const viewportReset = await client.evaluate(`(() => {
      if (window.innerHeight - (window.visualViewport?.height ?? window.innerHeight) > 120) {
        delete window.visualViewport;
      }
      const height = window.visualViewport?.height ?? -1;
      return { inner: window.innerHeight, vv: Math.round(height), inset: Math.round(window.innerHeight - height) };
    })()`)
    if (viewportReset.inset > 120) {
      fail('composer.focus-release-precondition', `the keyboard must be emulated as hidden ${JSON.stringify(viewportReset)}`)
    } else {
      pass('composer.focus-release-precondition', `keyboard inset ${viewportReset.inset}px`)
    }

    /** The release marker plus the focus state it is supposed to explain. */
    const releaseState = () => client.evaluate(`(() => {
      const editor = document.querySelector('[data-composer-input]');
      return {
        editorFocused: editor !== null && document.activeElement === editor,
        releases: document.documentElement.getAttribute('data-mobile-nav-focus-release'),
      };
    })()`)

    // The host's unlock effect focuses the editor with no gesture, which is the
    // state a phone is in when the user puts it down and later taps "+". Forcing
    // it explicitly makes the row independent of the host's own timing.
    const forced = await client.evaluate(`(() => {
      const editor = document.querySelector('[data-composer-input]');
      if (editor === null) return { editor: false };
      editor.focus();
      return { editor: true, focused: document.activeElement === editor };
    })()`)
    if (forced.editor !== true || forced.focused !== true) {
      fail('composer.focus-release-armed', `could not set up the retained focus ${JSON.stringify(forced)}`)
    } else {
      const released = await waitFor('retained focus released', releaseRowTimeoutMs, async () => {
        const state = await releaseState()
        return state.releases === null || state.editorFocused ? null : state
      }).catch(() => null)
      if (released === null) {
        const state = await releaseState().catch(() => null)
        fail('composer.focus-release-armed', `the editor kept the focus ${JSON.stringify(state)}`)
      } else {
        pass('composer.focus-release-armed', `releases=${released.releases}, editor no longer focused`)
      }
    }

    // The reported regression, reproduced: on a page that cannot scroll (this
    // shell is a full-height flex layout), iOS shrinks the LAYOUT viewport with
    // the keyboard too, so `innerHeight` and `visualViewport.height` move
    // together and the classic inset reads ~0 WHILE A KEYBOARD IS UP. A release
    // driven by that reading alone fired mid-typing and the keyboard dropped -
    // reported as "the keyboard hides by itself".
    const shrink = await client.evaluate(`(() => {
      const height = Math.max(200, window.innerHeight - 320);
      window.__dshProbeHeights = {
        inner: Object.getOwnPropertyDescriptor(window, 'innerHeight') ?? null,
        vv: Object.getOwnPropertyDescriptor(window, 'visualViewport') ?? null,
      };
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
      Object.defineProperty(window, 'visualViewport', {
        configurable: true,
        value: { height, scale: 1, width: window.innerWidth, offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0,
          addEventListener() {}, removeEventListener() {} },
      });
      const editor = document.querySelector('[data-composer-input]');
      if (editor !== null) editor.focus();
      return { asked: height, inner: window.innerHeight, vv: Math.round(window.visualViewport.height) };
    })()`)
    if (shrink.inner !== shrink.asked || shrink.vv !== shrink.asked) {
      fail('composer.focus-release-holds-when-both-heights-shrink', `could not emulate the iOS keyboard ${JSON.stringify(shrink)}`)
    } else {
      const beforeShrink = await releaseState().catch(() => null)
      // The decision is scheduled on the next animation frame, and a headless
      // page that receives no input renders no frames at all - an idle wait
      // measures nothing (this row passed on the inset-only build until frames
      // were pumped). The pump touches nothing: a tap would blur the editor by
      // itself and the row would then read a focus state the release did not
      // produce.
      const pumped = await client.evaluate(`new Promise((resolve) => {
        let frames = 0;
        const tick = () => { frames += 1; if (frames < 45) requestAnimationFrame(tick); else resolve(frames); };
        requestAnimationFrame(tick);
      })`).catch(() => 0)
      const held = await releaseState().catch(() => null)
      if (held !== null && held.editorFocused && held.releases === (beforeShrink?.releases ?? null)) {
        pass('composer.focus-release-holds-when-both-heights-shrink', `no release while the layout viewport is shrunk (releases=${held.releases}, ${pumped} frames)`)
      } else {
        fail('composer.focus-release-holds-when-both-heights-shrink', `the release took the keyboard away ${JSON.stringify({ before: beforeShrink, after: held })}`)
      }
      // Put the heights back: the release must resume, or the "fix" would just
      // be a disabled guard.
      const restored = await client.evaluate(`(() => {
        const saved = window.__dshProbeHeights;
        delete window.__dshProbeHeights;
        if (saved.inner !== null) Object.defineProperty(window, 'innerHeight', saved.inner); else delete window.innerHeight;
        if (saved.vv !== null) Object.defineProperty(window, 'visualViewport', saved.vv); else delete window.visualViewport;
        return { inner: window.innerHeight, vv: Math.round(window.visualViewport.height) };
      })()`)
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 200, radiusX: 8, radiusY: 8, force: 1 }] })
      await sleep(60)
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      const resumed = await waitFor('release resumes once the heights are real', releaseRowTimeoutMs, async () => {
        const state = await releaseState()
        return state.releases === null || state.editorFocused ? null : state
      }).catch(() => null)
      if (resumed === null) {
        fail('composer.focus-release-resumes-after-shrink', `no release after the heights were restored ${JSON.stringify(restored)}`)
      } else {
        pass('composer.focus-release-resumes-after-shink'.replace('shink', 'shrink'), `releases=${resumed.releases}`)
      }
    }

    // A finger on the editor means "I want to type": the release must hold off
    // for the keyboard animation instead of dropping the box the user just
    // tapped. A real touch is the only way to place that gesture.
    const editorBox = await client.evaluate(`(() => {
      const editor = document.querySelector('[data-composer-input]');
      if (editor === null) return null;
      const rect = editor.getBoundingClientRect();
      return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
    })()`)
    if (editorBox === null) {
      fail('composer.focus-release-yields-to-an-editor-tap', 'no editor to tap')
    } else {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: editorBox.x, y: editorBox.y, radiusX: 8, radiusY: 8, force: 1 }],
      })
      await sleep(60)
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await sleep(300)
      const held = await releaseState().catch(() => null)
      if (held !== null && held.editorFocused) {
        pass('composer.focus-release-yields-to-an-editor-tap', 'the tapped editor keeps the focus')
      } else {
        fail('composer.focus-release-yields-to-an-editor-tap', `the release dropped a rising keyboard ${JSON.stringify(held)}`)
      }
      // ... and the release is not sticky: once the grace has passed, a tap
      // somewhere else releases the focus again (a guard that stops working after
      // the first gesture would leave the phone in the bug it started in). The
      // tap is real and lands on the conversation, not on the editor and not on
      // the "+", so no gesture grace and no shadow are in play.
      await sleep(900)
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: 195, y: 200, radiusX: 8, radiusY: 8, force: 1 }],
      })
      await sleep(60)
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      const recovered = await waitFor('release resumes after the grace', releaseRowTimeoutMs, async () => {
        const state = await releaseState()
        // `releases === null` means the release never armed at all: A/B showed
        // this row passing on the neutered build, because the tap alone blurs the
        // editor and `editorFocused` went false without the release doing it.
        return state.releases === null || state.editorFocused ? null : state
      }).catch(() => null)
      if (recovered === null) {
        fail('composer.focus-release-resumes', 'the release stopped working after an editor tap')
      } else {
        pass('composer.focus-release-resumes', `releases=${recovered.releases}`)
      }
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

await main().catch((error) => {
  // A probe that dies with a stack instead of a FAIL row reads as an
  // infrastructure problem and hides which row was under test.
  fail('probe.crashed', error instanceof Error ? error.message : String(error))
  const failures = results.filter((entry) => entry.status === 'FAIL').length
  console.log(`SUMMARY pass=${results.filter((entry) => entry.status === 'PASS').length} fail=${failures}`)
  process.exitCode = 1
})

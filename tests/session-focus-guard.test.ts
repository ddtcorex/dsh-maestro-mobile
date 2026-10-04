import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FOCUS_GUARD_WINDOW_MS,
  SESSION_GUARD_MARKER,
  currentSessionId,
  shouldArmSessionGuard,
  shouldBlurInWindow,
  shouldCloseWindowOnPointer,
} from '../src/client/effects/session-focus-guard.ts'

test('the guard window is 800ms', () => {
  assert.equal(FOCUS_GUARD_WINDOW_MS, 800)
})

test('the guard owns a marker distinct from the "+" shadow', () => {
  // composer-plus-toggle.ts owns data-mobile-nav-focus-shadow on
  // documentElement. Sharing the name would let the two guards clobber each
  // other's arm/restore state.
  assert.equal(SESSION_GUARD_MARKER, 'data-mobile-nav-session-guard')
  assert.notEqual(SESSION_GUARD_MARKER, 'data-mobile-nav-focus-shadow')
})

test('the current session is the one the main view retains', () => {
  const snapshot = {
    byId: {
      a: { id: 'a', retainedBy: { mainView: 0 } },
      b: { id: 'b', retainedBy: { mainView: 1 } },
      c: { id: 'c' },
    },
  }
  assert.equal(currentSessionId(snapshot), 'b')
})

test('an empty or absent list has no current session', () => {
  assert.equal(currentSessionId({ byId: {} }), undefined)
  assert.equal(currentSessionId({ byId: { a: { id: 'a' } } }), undefined)
})

test('a real session change arms the guard', () => {
  assert.equal(shouldArmSessionGuard('a', 'b'), true)
  assert.equal(shouldArmSessionGuard(undefined, 'b'), true)
})

test('list churn with the same current session never arms the guard', () => {
  // Titles, ordering and background refresh all push snapshots that leave the
  // retained session alone. Arming on those flashes the guard and can swallow
  // a focus the user earned.
  assert.equal(shouldArmSessionGuard('a', 'a'), false)
  assert.equal(shouldArmSessionGuard(undefined, undefined), false)
})

test('a tap on the editor closes the window so the keyboard still opens', () => {
  // Review Focus #1: if the window survived the pointerdown, the browser's own
  // focus of that tap would land on a shadowed element and the user could not
  // type at all for the remainder of the window.
  const tap = { windowOpen: true, targetIsEditor: true, editorFocused: false }
  assert.equal(shouldCloseWindowOnPointer(tap), true)
})

test('a pointerdown outside the editor does not close the window', () => {
  assert.equal(
    shouldCloseWindowOnPointer({ windowOpen: true, targetIsEditor: false, editorFocused: false }),
    false,
  )
})

test('a pointerdown with the window closed is a no-op', () => {
  assert.equal(
    shouldCloseWindowOnPointer({ windowOpen: false, targetIsEditor: true, editorFocused: false }),
    false,
  )
})

test('a focus landing on the editor inside the window is taken back', () => {
  // The shadow alone is not enough: when InputBar remounts, the host focuses
  // in the commit's synchronous layout-effect phase, before any
  // MutationObserver microtask can shadow the fresh element.
  assert.equal(shouldBlurInWindow({ windowOpen: true, targetIsEditor: true, editorFocused: true }), true)
})

test('the blur fallback stays out of the way outside the window', () => {
  assert.equal(
    shouldBlurInWindow({ windowOpen: false, targetIsEditor: true, editorFocused: true }),
    false,
  )
})

test('a focus on some other control inside the window is untouched', () => {
  assert.equal(
    shouldBlurInWindow({ windowOpen: true, targetIsEditor: false, editorFocused: true }),
    false,
  )
})

test('the effect is exported and is the only entry point', async () => {
  const mod = await import('../src/client/effects/session-focus-guard.ts')
  assert.equal(typeof mod.installSessionFocusGuard, 'function')
})

/**
 * Install the effect against a hand-built fake DOM and return the listeners it
 * actually registered.
 *
 * This exists because a `typeof fn === 'function'` test passes on an effect
 * whose listeners are never attached — which is exactly the defect the whole-
 * branch review caught (handlers defined and disposed, never added). Asserting
 * on the SOURCE with a grep would be brittle; asserting that a registered
 * `focusin` handler actually runs is the behaviour that matters.
 */
function installWithFakeDom(snapshot) {
  const listeners = new Map()
  const doc = {
    addEventListener: (type, handler) => listeners.set(type, [...(listeners.get(type) ?? []), handler]),
    removeEventListener: (type, handler) => {
      listeners.set(type, (listeners.get(type) ?? []).filter((each) => each !== handler))
    },
    querySelectorAll: () => [],
    querySelector: () => null,
    documentElement: { hasAttribute: () => false },
    activeElement: null,
  }
  const win = { setTimeout: () => 0, clearTimeout: () => {}, matchMedia: () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }) }
  const globals = { document: doc, window: win, MutationObserver: class { observe() {} disconnect() {} } }
  for (const [key, value] of Object.entries(globals)) {
    globalThis[key] = value
  }
  globalThis.Element = class Element {}
  return {
    listeners,
    sessions: { list: { getSnapshot: () => snapshot, subscribe: () => () => {} } },
    restore: () => { for (const k of Object.keys(globals)) delete globalThis[k] },
  }
}

test('the effect registers BOTH document listeners it later removes', async () => {
  // The symmetry is the contract: the disposer calls removeEventListener for
  // pointerdown and focusin, so the installer must attach exactly those two in
  // the capture phase. An add/remove asymmetry is silent at runtime — the
  // handlers simply never run — and no pure-predicate test can see it.
  const { installSessionFocusGuard } = await import('../src/client/effects/session-focus-guard.ts')
  const fake = installWithFakeDom({ byId: { a: { id: 'a', retainedBy: { mainView: 1 } } } })
  const ctx = { sessions: fake.sessions, effect: (fn) => { fn() } }
  try {
    installSessionFocusGuard(ctx)
    assert.deepEqual(
      [...fake.listeners.keys()].sort(),
      ['focusin', 'pointerdown'],
      'both listeners must be attached, in the capture phase',
    )
    for (const type of ['focusin', 'pointerdown']) {
      assert.equal(fake.listeners.get(type).length, 1, `${type} registered exactly once`)
    }
  } finally {
    fake.restore()
  }
})

test('two shadow owners on one editor cannot clobber each other', async () => {
  // createFocusShadow deletes the own-property on restore, and two independent
  // instances share that one property. Order: the session guard arms, the "+"
  // guard arms, then the "+" guard restores FIRST (its window is shorter) —
  // that delete removes the session guard's no-op too, so the native focus()
  // runs and the keyboard pops inside the window the guard still believes is
  // armed. Modelled on a prototype chain, matching editor-focus-shadow.ts.
  const { createFocusShadow } = await import('../src/client/effects/editor-focus-shadow.ts')
  let nativeFocusCalls = 0
  class FakeEditor {}
  Object.defineProperty(FakeEditor.prototype, 'focus', {
    value: () => { nativeFocusCalls += 1 }, configurable: true, writable: true,
  })
  const editor = new FakeEditor()
  const sessionGuard = createFocusShadow(() => editor)
  const plusGuard = createFocusShadow(() => editor)

  sessionGuard.arm()
  plusGuard.arm()
  editor.focus()
  assert.equal(nativeFocusCalls, 0, 'both shadows active: native focus must not run')

  // The shorter-lived owner releases first.
  plusGuard.restore()
  editor.focus()
  assert.equal(nativeFocusCalls, 0,
    'releasing one shadow must NOT unblock native focus while another still holds it')
  assert.equal(sessionGuard.armed, true, 'the surviving owner still reports armed')

  sessionGuard.restore()
  editor.focus()
  assert.equal(nativeFocusCalls, 1, 'once every owner released, focus is unblocked again')
})

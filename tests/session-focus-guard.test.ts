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

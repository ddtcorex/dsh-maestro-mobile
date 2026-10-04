import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FOCUS_GUARD_WINDOW_MS,
  SESSION_GUARD_MARKER,
  currentSessionId,
  shouldArmSessionGuard,
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

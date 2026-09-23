import assert from 'node:assert/strict'
import test from 'node:test'
import {
  NUDGE_MAX_PX,
  RELEASE_GESTURE_GRACE_MS,
  RELEASE_HEARTBEAT_MS,
  keyboardIsReadable,
  shouldReleaseComposerFocus,
  shouldRestoreScroll,
} from '../src/client/effects/composer-focus-release.ts'

/** The resting state that raises the keyboard on iOS: focused editor, no IME. */
const resting = {
  editorFocused: true,
  keyboardVisible: false,
  keyboardReadable: true,
  editorGestureActive: false,
  shadowArmed: false,
}

test('releases the composer editor while the keyboard is hidden', () => {
  // The reported bug: iOS keeps the editable as the focused element after the
  // keyboard goes away, and the next tap anywhere (the composer "+") makes
  // WebKit show the keyboard for it. Nothing is being focused at that moment, so
  // the focus shadow cannot help - the retained focus has to be released.
  assert.equal(shouldReleaseComposerFocus(resting), true)
})

test('never takes the keyboard away from someone who is typing', () => {
  // The opposite failure, reported from the phone as the composer jumping: an
  // editor blurred while its keyboard is up starts the hide animation, and the
  // keyboard is the composer's floor.
  assert.equal(shouldReleaseComposerFocus({ ...resting, keyboardVisible: true }), false)
})

test('does nothing when the editor is not the focused element', () => {
  assert.equal(shouldReleaseComposerFocus({ ...resting, editorFocused: false }), false)
})

test('holds off while a finger is on the editor and the keyboard is still rising', () => {
  // iOS needs ~250ms to show the keyboard: a release in that window would blur
  // the box the user just tapped and the keyboard would never appear.
  assert.equal(shouldReleaseComposerFocus({ ...resting, editorGestureActive: true }), false)
})

test('holds off while a "+" interaction owns the focus', () => {
  // Releasing here is the on-tap blur that bounced the composer row; the focus
  // shadow already blocks the host's focus() for the length of the interaction.
  assert.equal(shouldReleaseComposerFocus({ ...resting, shadowArmed: true }), false)
})

test('holds off when the keyboard state cannot be read', () => {
  // A zoomed visual viewport reads as "no keyboard" (that is what the pinch
  // guard is for), so the release must refuse to act on it rather than blur an
  // editor the user is zoomed into and typing in.
  assert.equal(shouldReleaseComposerFocus({ ...resting, keyboardReadable: false }), false)
})

test('a missing or pinch-zoomed visual viewport is unreadable', () => {
  assert.equal(keyboardIsReadable(null), false)
  assert.equal(keyboardIsReadable({ height: 400, scale: 2.5 }), false)
  assert.equal(keyboardIsReadable({ height: 400, scale: 1 }), true)
})

test('the gesture grace covers the keyboard animation, not the next tap', () => {
  assert.ok(RELEASE_GESTURE_GRACE_MS >= 400, 'must outlast the ~250ms keyboard animation')
  assert.ok(RELEASE_GESTURE_GRACE_MS <= 1000, 'a longer grace would leave the retained focus in place')
})

test('the heartbeat re-checks the state often enough to matter', () => {
  // A focus path that dispatches no focusin is measured (see
  // RELEASE_HEARTBEAT_MS), so the state is polled too - but a poll slower than
  // a user's tap would leave the retained focus in place exactly when it counts.
  assert.ok(RELEASE_HEARTBEAT_MS <= 600, 'a slower heartbeat lets a tap arrive first')
  assert.ok(RELEASE_HEARTBEAT_MS >= 200, 'a faster one is wake-up churn for a state that rarely exists')
})

test('restores the scroll a blur nudged, and only that', () => {
  // iOS reacts to a programmatic blur by nudging the visual viewport. The
  // restore is the compensation for taking the blur off the tap.
  assert.equal(shouldRestoreScroll(0, false), false, 'nothing moved: nothing to restore')
  assert.equal(shouldRestoreScroll(-12, false), true)
  assert.equal(shouldRestoreScroll(12, false), true)
  assert.equal(shouldRestoreScroll(3 * NUDGE_MAX_PX, false), false, 'a large move is the user scrolling, not a nudge')
  assert.equal(shouldRestoreScroll(12, true), false, 'a keyboard animation moves the page by design')
})

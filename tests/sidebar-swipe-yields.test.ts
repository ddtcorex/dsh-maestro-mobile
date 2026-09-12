import assert from 'node:assert/strict'
import test from 'node:test'

import { shouldAbortForMultiTouch, shouldAbortForTouchCount } from '../src/client/effects/sidebar-swipe.ts'

test('a second pointer abandons the stroke instead of being ignored', () => {
  // Merely ignoring the extra pointer keeps the stroke alive — and with it the
  // touchmove preventDefault, which cancels the browser's pinch zoom.
  assert.equal(shouldAbortForMultiTouch(7, 9), true)
  assert.equal(shouldAbortForMultiTouch(7, 7), false)
  assert.equal(shouldAbortForMultiTouch(0, 9), false)
})

test('two fingers on screen abandon the touchmove preventDefault path', () => {
  // Belt-and-braces for engines that hand the gesture to the compositor
  // without delivering a second pointerdown.
  assert.equal(shouldAbortForTouchCount(2), true)
  assert.equal(shouldAbortForTouchCount(3), true)
  assert.equal(shouldAbortForTouchCount(1), false)
  assert.equal(shouldAbortForTouchCount(0), false)
})

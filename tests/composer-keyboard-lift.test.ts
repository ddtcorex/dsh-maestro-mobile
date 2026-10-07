import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CHANNEL_TOLERANCE_PX,
  computeComposerLift,
  installComposerKeyboardLift,
} from '../src/client/effects/composer-keyboard-lift.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LIFT = readFileSync(join(ROOT, 'src/client/effects/composer-keyboard-lift.ts'), 'utf8')

// Reporter geometry (iPhone 13 Pro, 390x844 css, keyboard plus assistant top
// at 427): at focus the seat bottom is flush with the keyboard (iOS scrolled
// to 417); after the host helper's first keystroke it sits at 585 (427 + 158)
// behind the form-assistant bar.
const KEYBOARD_TOP = 427
const FOCUSED = { seatBottom: 427, viewportHeight: KEYBOARD_TOP, scale: 1, scrollY: 417, offsetTop: 417 }
const MISFIRED = { seatBottom: 585, viewportHeight: KEYBOARD_TOP, scale: 1, scrollY: 259, offsetTop: 259 }

test('the reporter geometry: no lift while flush, 158px lift after the helper misfires', () => {
  assert.equal(computeComposerLift(FOCUSED), 0)
  assert.equal(computeComposerLift(MISFIRED), 158)
})

test('the overlap decides everything: positive lifts, zero and negative rest', () => {
  assert.equal(computeComposerLift({ ...MISFIRED, seatBottom: 440 }), 13)
  assert.equal(computeComposerLift({ ...MISFIRED, seatBottom: 427 }), 0)
  assert.equal(computeComposerLift({ ...MISFIRED, seatBottom: 300 }), 0)
  assert.equal(computeComposerLift({ ...MISFIRED, seatBottom: -200 }), 0)
})

test('pinch zoom fails open: the screen-space mapping is only trusted at scale 1', () => {
  assert.equal(computeComposerLift({ ...MISFIRED, scale: 1.4 }), 0)
  assert.equal(computeComposerLift({ ...MISFIRED, scale: 0.5 }), 0)
})

test('scroll-channel disagreement fails open: the layout-coordinate model is unverified', () => {
  // A visual-viewport pan (pinch pan, or an engine switching its
  // keyboard-scroll model) separates offsetTop from scrollY; then rect.bottom
  // is no longer a screen position and lifting from it would double-shift.
  assert.equal(computeComposerLift({ ...MISFIRED, offsetTop: 300 }), 0)
  // The documented tolerance is inclusive: exactly CHANNEL_TOLERANCE_PX
  // drift is still trusted, one px more bails.
  assert.equal(computeComposerLift({ ...MISFIRED, seatBottom: 440, offsetTop: 259 + CHANNEL_TOLERANCE_PX }), 13)
  assert.equal(computeComposerLift({ ...MISFIRED, seatBottom: 440, offsetTop: 259 + CHANNEL_TOLERANCE_PX + 1 }), 0)
  // Within tolerance the rounding and event-order drift is still trusted. The
  // channels are the focused-state pair (417 vs 400, 17px apart) - MISFIRED's
  // own 259/259 pair would not distinguish tolerance from bail.
  assert.equal(computeComposerLift({ ...MISFIRED, seatBottom: 440, scrollY: 417, offsetTop: 400 }), 13)
})

test('garbage readings rest at zero', () => {
  for (const bad of [NaN, Infinity, -Infinity]) {
    assert.equal(computeComposerLift({ ...MISFIRED, seatBottom: bad }), 0)
    assert.equal(computeComposerLift({ ...MISFIRED, viewportHeight: bad }), 0)
    assert.equal(computeComposerLift({ ...MISFIRED, scale: bad }), 0)
    assert.equal(computeComposerLift({ ...MISFIRED, scrollY: bad }), 0)
    assert.equal(computeComposerLift({ ...MISFIRED, offsetTop: bad }), 0)
  }
})

test('the applied lift is added back before comparing: no fixed-point oscillation', () => {
  // After the adapter lifts by 158 the rect bottom reads 427 again (the
  // transform moved it up on screen). Adding the applied lift back recovers
  // the un-lifted 585, so the next frame recomputes the same 158 instead of
  // resting at 0, releasing the transform, and re-lifting every frame.
  const rectBottomAfterLift = 427
  const appliedLift = 158
  assert.equal(
    computeComposerLift({ ...MISFIRED, seatBottom: rectBottomAfterLift + appliedLift }),
    158,
    'with the add-back the fixed point is stable',
  )
  assert.equal(
    computeComposerLift({ ...MISFIRED, seatBottom: rectBottomAfterLift }),
    0,
    'without the add-back the same frame would rest and oscillate',
  )
})

test('the effect is iOS-gated, focus-scoped, seat-anchored and restores on release', () => {
  assert.match(LIFT, /detectIosWebKit\(/)
  assert.match(LIFT, /installMobileEffect\(/)
  assert.match(LIFT, /addEventListener\('focusin'/)
  assert.match(LIFT, /addEventListener\('focusout'/)
  assert.match(LIFT, /\[data-composer-input\]/)
  // Seat resolution without hashed classes: the stable host marker from
  // composer-dom.ts, never the upstream hashed seat fragment.
  assert.match(LIFT, /\[data-composer-seat\]/)
  assert.doesNotMatch(LIFT, /composerSeat/)
  assert.match(LIFT, /translateY\(/)
  // The rect includes the applied transform: the adapter must add it back.
  assert.match(LIFT, /\.bottom \+ appliedLift/)
  // Arm-clear and teardown both restore the inline transform.
  assert.match(LIFT, /style\.transform = ''/)
  // Viewport and window listeners die together with the frame on release.
  assert.match(LIFT, /removeEventListener\('resize'/)
  assert.match(LIFT, /removeEventListener\('scroll'/)
  assert.match(LIFT, /cancelAnimationFrame/)
  // No MutationObserver: viewport and focus events plus rAF carry the effect.
  assert.doesNotMatch(LIFT, /MutationObserver/)
})

test('the installer is wired into the client entry', () => {
  assert.equal(typeof installComposerKeyboardLift, 'function')
  const index = readFileSync(join(ROOT, 'src/client/index.tsx'), 'utf8')
  assert.match(index, /import \{ installComposerKeyboardLift \}/)
  assert.match(index, /installComposerKeyboardLift\(ctx\)/)
})

test('the channel tolerance covers jitter but still catches a real pan', () => {
  assert.ok(CHANNEL_TOLERANCE_PX >= 16, 'a tighter bound bails on rounding and event-order jitter')
  assert.ok(CHANNEL_TOLERANCE_PX <= 32, 'a wider one misses a real visual-viewport pan')
})

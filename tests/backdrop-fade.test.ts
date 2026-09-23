import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BACKDROP_SELECTOR,
  backdropFadeTransition,
  fadeDrawerBackdrop,
  type FadeTarget,
} from '../src/client/effects/backdrop-fade.ts'

/** Records every style write and the order of the reads between them. */
class FakeBackdrop implements FadeTarget {
  log: string[] = []

  readonly style = {
    setProperty: (property: string, value: string, priority?: string): void => {
      this.log.push(`set ${property}=${value}${priority === undefined ? '' : ` !${priority}`}`)
    },
  }

  getBoundingClientRect(): { width: number; height: number } {
    this.log.push('read rect')
    return { width: 390, height: 844 }
  }
}

test('the close fade animates opacity over the commit window', () => {
  // The duration is the drawer's own COMMIT_ANIM_MS, and the easing must match
  // it: a different curve would leave the dimming visibly behind or ahead of the
  // drawer sliding out, which is the whole point of fading it here.
  assert.equal(backdropFadeTransition(280), 'opacity 280ms ease-in-out')
  assert.match(backdropFadeTransition(280), /ease-in-out$/)
})

test('the fade flushes layout before writing opacity', () => {
  // With both writes in one task Chrome can coalesce the recalc and jump
  // straight to opacity 0 - no transition at all. The drawer's own commit
  // flushes its rect for the same reason.
  const backdrop = new FakeBackdrop()
  assert.equal(fadeDrawerBackdrop(280, () => backdrop), true)
  assert.deepEqual(backdrop.log, [
    'set transition=opacity 280ms ease-in-out !important',
    'read rect',
    'set opacity=0 !important',
    'set pointer-events=none !important',
  ])
})

test('the fade marks the layer untappable while it leaves', () => {
  // The backdrop is the drawer's own close target; once it is fading it must
  // stop being a hit target, or a stray tap lands on an invisible button.
  const backdrop = new FakeBackdrop()
  fadeDrawerBackdrop(280, () => backdrop)
  assert.ok(backdrop.log.includes('set pointer-events=none !important'))
})

test('every write is important', () => {
  // React owns this element's style prop (`pointerEvents: 'auto'`), and the
  // backdrop carries an entry animation; only an important author declaration
  // outranks both.
  const backdrop = new FakeBackdrop()
  fadeDrawerBackdrop(280, () => backdrop)
  for (const line of backdrop.log.filter((entry) => entry.startsWith('set '))) {
    assert.match(line, / !important$/, line)
  }
})

test('a missing backdrop is not an error', () => {
  // The element only exists while the drawer is open: a close commit that
  // somehow runs without it must stay a no-op, not throw.
  assert.equal(fadeDrawerBackdrop(280, () => null), false)
})

test('the selector names the shell slot element, not a class hash', () => {
  // Anchor for the next host upgrade: the backdrop is the slot component's own
  // marker (components/ShellOverlay.tsx), which survives its rebuilds.
  assert.equal(BACKDROP_SELECTOR, '[data-mobile-nav="backdrop"]')
})

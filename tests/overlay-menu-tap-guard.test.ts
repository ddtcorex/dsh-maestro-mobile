import assert from 'node:assert/strict'
import test from 'node:test'

import { shouldSwallowOverlayFocusOut } from '../src/client/effects/overlay-menu-tap-guard.ts'
import { OVERLAY_MENU_SELECTOR } from '../src/client/effects/sidebar-swipe.ts'

/** A focusout target inside the overlay whose surface answers contains(). */
const insideTarget = (surface: { contains(node: unknown): boolean }): { closest(selector: string): unknown } => ({
  closest: (selector: string) => (selector === OVERLAY_MENU_SELECTOR ? surface : null),
})

test('the tap-owned focus loss that dismisses the card is stopped', () => {
  // iOS Safari does not move focus onto the tapped row: the host menu reads the
  // focusout with relatedTarget null as "dismiss", unmounts the card, and the
  // tap's own click never selects. Reported as "the model list appears but
  // choosing a model does nothing, the menu just closes".
  const surface = { contains: () => false }
  assert.equal(shouldSwallowOverlayFocusOut(insideTarget(surface), null, true), true)
  assert.equal(shouldSwallowOverlayFocusOut(insideTarget(surface), {}, true), true)
})

test('roving focus inside the same surface passes through', () => {
  // Chrome focuses the tapped row, producing focusout with the new row as
  // relatedTarget: the host's own navigation, never a dismissal.
  const inner = {}
  const surface = { contains: (node: unknown) => node === inner }
  assert.equal(shouldSwallowOverlayFocusOut(insideTarget(surface), inner, true), false)
})

test('everything outside the tap window passes through', () => {
  const surface = { contains: () => false }
  const target = insideTarget(surface)
  // No tap in flight: keyboard Tab-out and mouse focus moves still dismiss.
  assert.equal(shouldSwallowOverlayFocusOut(target, null, false), false)
  // Focus losses that do not start inside the overlay are never ours.
  assert.equal(shouldSwallowOverlayFocusOut({ closest: () => null }, null, true), false)
  assert.equal(shouldSwallowOverlayFocusOut(null, null, true), false)
  assert.equal(shouldSwallowOverlayFocusOut('body', null, true), false)
  // A surface that cannot answer contains() cannot prove the dismissal.
  assert.equal(shouldSwallowOverlayFocusOut({ closest: () => ({}) }, null, true), false)
})

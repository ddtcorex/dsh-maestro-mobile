import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BLOCKING_MODAL_SELECTOR,
  SHELL_DRAWER_DIALOG_SELECTOR,
  findBlockingModal,
} from '../src/client/effects/modal-scope.ts'
import { DRAWER_COLUMN_SELECTOR, pickDrawerColumn } from '../src/client/effects/drawer-dom.ts'
import { armedStrokeSurvivesCancel } from '../src/client/effects/sidebar-swipe.ts'

/**
 * A blocking modal is an `[aria-modal="true"]` that is NOT the shell's own
 * drawer. DSH 0.2.2 turns the sidebar root into `role="dialog"
 * aria-modal="true" data-shortcut-modal="sidebar"` while the drawer is open,
 * so a bare `[aria-modal="true"]` query answers "a modal is up" the instant the
 * drawer opens — which is what made the drawer close itself after opening.
 */
test('the blocking-modal query steps over the shell drawer dialog', () => {
  assert.equal(SHELL_DRAWER_DIALOG_SELECTOR, '[data-shortcut-modal="sidebar"]')
  assert.match(BLOCKING_MODAL_SELECTOR, /^\[aria-modal="true"\]/)
  assert.ok(
    BLOCKING_MODAL_SELECTOR.includes(`:not(${SHELL_DRAWER_DIALOG_SELECTOR})`),
    `the query must exclude the drawer dialog, got ${BLOCKING_MODAL_SELECTOR}`,
  )
})

test('findBlockingModal asks the document for the blocking-modal query only', () => {
  const asked: string[] = []
  const empty = { querySelector: (selector: string): null => (asked.push(selector), null) }
  assert.equal(findBlockingModal(empty), null)
  assert.deepEqual(asked, [BLOCKING_MODAL_SELECTOR])

  const dialog = { tagName: 'DIV' }
  assert.equal(findBlockingModal({ querySelector: () => dialog }), dialog)
})

test('without a document the modal query answers "none" instead of throwing', () => {
  assert.equal(findBlockingModal(null), null)
})

// ---------------------------------------------------------------------------
// Drawer element resolution
// ---------------------------------------------------------------------------

/**
 * The frame's first element child is NOT the drawer on DSH 0.2.2: AppFrame
 * renders its own `drawerMask` (`div[data-sidebar-mask]`) before the sidebar
 * column in drawer mode, so first-child selection bound the follow transform
 * to the dimming layer while the real drawer sat still.
 */
test('the drawer is the sidebar column, not the host drawer mask', () => {
  assert.equal(DRAWER_COLUMN_SELECTOR, '[class*="_sidebarCol"]')
  const mask = { name: 'mask' }
  const column = { name: 'column' }
  const frame = {
    firstElementChild: mask,
    querySelector: (selector: string) => (selector === `:scope > ${DRAWER_COLUMN_SELECTOR}` ? column : null),
  }
  assert.equal(pickDrawerColumn(frame), column)
})

test('the first child is only a fallback for a host without the column marker', () => {
  const mask = { name: 'mask' }
  const frame = { firstElementChild: mask, querySelector: () => null }
  assert.equal(pickDrawerColumn(frame), mask)
  assert.equal(pickDrawerColumn(null), null)
})

// ---------------------------------------------------------------------------
// A stroke the browser takes away
// ---------------------------------------------------------------------------

/**
 * `pointercancel` means the browser claimed the gesture (a native scroll, a
 * system gesture, a second finger). It carries no coordinates (measured:
 * clientX/clientY are 0), so the release verdict has to come from the last
 * observed sample. Reverting unconditionally is what turns a completed
 * left-edge swipe into "the drawer opens and immediately closes": the open
 * follow has already flipped the host state, so the abort animates the drawer
 * straight back into its slot.
 */
test('a cancelled stroke keeps the drawer open once the finger has travelled far enough', () => {
  // 0.16 * 390 = 62.4px is the open threshold; 288px is a full swipe.
  assert.equal(armedStrokeSurvivesCancel({ dx: 288, dy: 0, velX: 0 }, 390, false), true)
  assert.equal(armedStrokeSurvivesCancel({ dx: 63, dy: 4, velX: 0 }, 390, false), true)
})

test('a cancelled twitch still springs the drawer back', () => {
  assert.equal(armedStrokeSurvivesCancel({ dx: 30, dy: 2, velX: 0 }, 390, false), false)
  // Vertical-dominant strokes are never drawer strokes.
  assert.equal(armedStrokeSurvivesCancel({ dx: 120, dy: 200, velX: 0 }, 390, false), false)
  // Leftward travel cannot open a closed drawer.
  assert.equal(armedStrokeSurvivesCancel({ dx: -288, dy: 0, velX: 0 }, 390, false), false)
})

test('a cancelled flick counts by velocity even when the distance is short', () => {
  assert.equal(armedStrokeSurvivesCancel({ dx: 40, dy: 0, velX: 0.5 }, 390, false), true)
  assert.equal(armedStrokeSurvivesCancel({ dx: 40, dy: 0, velX: 0.1 }, 390, false), false)
})

test('the RTL mirror uses the same logical direction as the release classifier', () => {
  // In RTL the drawer lives on the right edge, so a rightward raw delta is the
  // closing direction and a leftward raw delta is the opening one.
  assert.equal(armedStrokeSurvivesCancel({ dx: -288, dy: 0, velX: 0 }, 390, true), true)
  assert.equal(armedStrokeSurvivesCancel({ dx: 288, dy: 0, velX: 0 }, 390, true), false)
})

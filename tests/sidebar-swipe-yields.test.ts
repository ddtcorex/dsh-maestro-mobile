import assert from 'node:assert/strict'
import test from 'node:test'

import { shouldAbortForMultiTouch, shouldAbortForTouchCount, selectionOwnsStroke, takeoverActive, OVERLAY_SELECTOR } from '../src/client/effects/sidebar-swipe.ts'

/** Install DOM globals for one call, then restore whatever was there. */
function withDom<T>(dom: { window?: unknown; document?: unknown }, run: () => T): T {
  const hadWindow = 'window' in globalThis
  const hadDocument = 'document' in globalThis
  const previousWindow = (globalThis as Record<string, unknown>).window
  const previousDocument = (globalThis as Record<string, unknown>).document
  if ('window' in dom) (globalThis as Record<string, unknown>).window = dom.window
  if ('document' in dom) (globalThis as Record<string, unknown>).document = dom.document
  try {
    return run()
  } finally {
    if (hadWindow) (globalThis as Record<string, unknown>).window = previousWindow
    else delete (globalThis as Record<string, unknown>).window
    if (hadDocument) (globalThis as Record<string, unknown>).document = previousDocument
    else delete (globalThis as Record<string, unknown>).document
  }
}

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

test('a live text selection owns the stroke', () => {
  // A selection-handle drag is horizontally dominant and geometrically
  // identical to a swipe: without this yield the drawer arms and collapses the
  // selection the user is extending.
  assert.equal(
    withDom({ window: { getSelection: () => ({ isCollapsed: false }) }, document: { activeElement: null } }, () =>
      selectionOwnsStroke()),
    true,
  )
})

test('a collapsed document selection falls through to the active element', () => {
  const collapsed = { getSelection: () => ({ isCollapsed: true }) }
  assert.equal(
    withDom({ window: collapsed, document: { activeElement: null } }, () => selectionOwnsStroke()),
    false,
  )
  // A selection inside a text control is invisible to window.getSelection:
  // measured on the composer during a hijacked stroke, the document selection
  // reported isCollapsed while the textarea held 0..20.
  assert.equal(
    withDom(
      {
        window: collapsed,
        document: { activeElement: { tagName: 'TEXTAREA', selectionStart: 0, selectionEnd: 20 } },
      },
      () => selectionOwnsStroke(),
    ),
    true,
  )
  assert.equal(
    withDom(
      {
        window: collapsed,
        document: { activeElement: { tagName: 'INPUT', selectionStart: 1, selectionEnd: 1 } },
      },
      () => selectionOwnsStroke(),
    ),
    false,
  )
})

test('a non-text control never owns the stroke, and a throwing getter is not fatal', () => {
  const collapsed = { getSelection: () => ({ isCollapsed: true }) }
  // Input types without a text selection (checkbox, number, …) report null and
  // older WebKit/Gecko throw InvalidStateError; both mean "no selection is
  // being dragged", never "this control owns the stroke".
  assert.equal(
    withDom({ window: collapsed, document: { activeElement: { tagName: 'DIV' } } }, () => selectionOwnsStroke()),
    false,
  )
  const throwing = {
    tagName: 'TEXTAREA',
    get selectionStart(): number {
      throw new Error('InvalidStateError')
    },
    selectionEnd: 3,
  }
  assert.equal(
    withDom({ window: collapsed, document: { activeElement: throwing } }, () => selectionOwnsStroke()),
    false,
  )
})

test('without a DOM the predicate is inert', () => {
  assert.equal(withDom({}, () => selectionOwnsStroke()), false)
})

test('an open conversation overlay counts as a takeover', () => {
  // The host marks every conversation.view overlay root (trajectory tables,
  // file viewer, future third-party views) with the same generic attribute;
  // reading it directly keeps the yield rule independent of any one plugin.
  // While it is open the drawer edge-swipe must yield so horizontal content
  // panning wins the left-edge zone — the FAB still opens the drawer.
  const documentElement = { hasAttribute: (name: string) => name === 'data-dsh-ssh-active' }
  assert.equal(
    withDom(
      { document: { documentElement, querySelector: (selector: string) => (selector === OVERLAY_SELECTOR ? {} : null) } },
      () => takeoverActive(),
    ),
    true,
  )
  assert.equal(
    withDom(
      { document: { documentElement, querySelector: () => null } },
      () => takeoverActive(),
    ),
    true,
    'taskboard / ssh takeovers still yield',
  )
  const idle = { hasAttribute: () => false }
  assert.equal(
    withDom({ document: { documentElement: idle, querySelector: () => null } }, () => takeoverActive()),
    false,
  )
})

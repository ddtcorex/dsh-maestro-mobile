import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { MOBILE_CSS } from '../src/client/styles/index.ts'
import {
  SELECTING_ATTR,
  selectionAnchorElement,
  selectionCountsForScope,
  shouldMarkSelecting,
} from '../src/client/effects/selection-scope.ts'

const SRC = readFileSync(new URL('../src/client/effects/selection-scope.ts', import.meta.url), 'utf8')

/** Element fake answering closest() from a membership table. */
function fakeElement(inside: string[]): { closest: (selector: string) => unknown } {
  return { closest: (selector: string) => (inside.includes(selector) ? {} : null) }
}

/** Body of the phone-tier media block (brace-walked, so nested at-rules are kept). */
function phoneBlock(css: string): string {
  const start = css.indexOf('@media (max-width: 1023px) and (pointer: coarse) {')
  assert.ok(start >= 0, 'phone-tier media block present')
  let depth = 0
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) return css.slice(css.indexOf('{', start) + 1, i)
  }
  return css.slice(start)
}

/** Body of the rule whose selector starts at `at` (brace-matched). */
function bodyAt(css: string, at: number): string {
  assert.ok(at >= 0, 'rule not found')
  const open = css.indexOf('{', at)
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}') {
      depth--
      if (depth === 0) return css.slice(open + 1, i)
    }
  }
  return ''
}

test('no selection means no marker, and a collapsed selection means no marker', () => {
  assert.equal(shouldMarkSelecting(null), false)
  assert.equal(
    shouldMarkSelecting({ isCollapsed: true, anchorNode: fakeElement(['[data-phase]']) }),
    false,
  )
})

test('a conversation-anchored selection raises the marker', () => {
  assert.equal(
    shouldMarkSelecting({ isCollapsed: false, anchorNode: fakeElement(['[data-phase]']) }),
    true,
  )
})

test('composer and drawer selections never raise the marker', () => {
  // The composer editing surface and any drawer field keep their taps: their
  // chrome must stay in hit-testing even mid-selection.
  assert.equal(
    selectionCountsForScope(fakeElement(['[data-composer-card]', '[data-phase]'])),
    false,
  )
  assert.equal(selectionCountsForScope(fakeElement([])), false)
  assert.equal(selectionCountsForScope(null), false)
})

test('anchors resolve to an element: elements to themselves, text to parents', () => {
  const element = fakeElement(['[data-phase]'])
  assert.equal(selectionAnchorElement(element), element)
  const text = { parentElement: element }
  assert.equal(selectionAnchorElement(text), element)
  assert.equal(selectionAnchorElement({ parentElement: null }), null)
  assert.equal(selectionAnchorElement(null), null)
  assert.equal(
    shouldMarkSelecting({ isCollapsed: false, anchorNode: { parentElement: element } }),
    true,
  )
})

test('the header seat exits hit-testing under the marker, phone tier only', () => {
  const selector = `html[${SELECTING_ATTR}] [data-mobile-nav="frame"] [data-phase] [data-slot="conversation.session.header"]`
  const phone = phoneBlock(MOBILE_CSS)
  const block = bodyAt(phone, phone.indexOf(`${selector} {`))
  assert.match(block, /pointer-events:\s*none !important/)
  // Only pointer-events: a drag-scoped rule must never touch layout, or the
  // mid-drag geometry shift disturbs the selection it exists to protect.
  const props = [...new Set(block.split(';').map((d) => d.split(':')[0].trim()).filter(Boolean))].sort()
  assert.deepEqual(props, ['pointer-events'])
  // The seat anchor covers both header generations (pre-0.1.7 <header> and
  // the 0.1.7 div row); a bare `header` element selector would miss the divs.
  assert.doesNotMatch(block, /position|margin|padding|display/)
  const desktop = MOBILE_CSS.slice(MOBILE_CSS.indexOf('@media (min-width: 1024px), (pointer: fine), (pointer: none)'))
  assert.ok(!desktop.includes(SELECTING_ATTR), 'desktop block must not mention the selecting marker')
})

test('the marker is driven by selectionchange and always cleaned up', () => {
  assert.match(SRC, /installMobileEffect\(ctx, 'dsh-maestro-mobile: selection scope'/)
  assert.match(SRC, /document\.addEventListener\('selectionchange', sync\)/)
  assert.match(SRC, /document\.removeEventListener\('selectionchange', sync\)/)
  assert.match(SRC, /document\.documentElement\.removeAttribute\(SELECTING_ATTR\)/)
})

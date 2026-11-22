import assert from 'node:assert/strict'
import test from 'node:test'

import { stripCssComments } from '../scripts/strip-css-comments.mjs'
import { MOBILE_CSS } from '../src/client/styles/index.ts'

// Comments carry the design record and must never satisfy or fail a selector
// assertion (docs/maintenance/pitfalls.md): this file's own prose names the
// aria-modal guard it warns about.
const css = stripCssComments(MOBILE_CSS)

/**
 * The drawer footer card holds one 32px account row. The host wraps it in a
 * 12px padding plus a 4px row margin, so on a phone the card measures 66px
 * tall: taller than every drawer row, with 34px of dead space around a single
 * line ("the More button in the sidebar is too tall", mobile report
 * 2026-11-22, measured at 390x844).
 *
 * The plugin's own footer treatment (42px Bento trigger, elevated fill, 12px
 * frame) does not reach the drawer: those rules end in
 * `:not([aria-modal="true"] *)` and the open drawer IS an aria-modal dialog
 * (`div[role="dialog"][aria-modal="true"][data-slot="sidebar"]`), so the host
 * default shows instead. That guard is why the trap below exists: a footer
 * rule carrying it is silently inert in the drawer, which is the only place
 * the mobile plugin renders a footer.
 *
 * The fix keeps the host row and tightens the frame to the drawer's own 8px
 * rhythm: 8 + 32 + 8 plus the card's 1px border measures 50px.
 */
const ruleBlocks = (css) => [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((match) => ({ selector: match[1], body: match[2] }))

test('the drawer footer frame uses the 8px rhythm', () => {
  const frame = ruleBlocks(css).filter(
    (rule) => rule.selector.includes('_footArea')
      && rule.selector.includes('_sidebarCol')
      && !rule.selector.includes('_triggerRow'),
  )
  assert.equal(frame.length, 1, 'exactly one footer frame rule belongs in the drawer scope')
  assert.match(frame[0].body, /padding:\s*8px\s*!important/, 'the footer card is 12px padded by the host and reads 66px tall')
})

test('the footer row carries no vertical margin of its own', () => {
  const row = ruleBlocks(css).filter(
    (rule) => rule.selector.includes('_footArea')
      && rule.selector.includes('_triggerRow')
      && /margin-block/.test(rule.body),
  )
  assert.equal(row.length, 1, 'exactly one rule zeroes the footer row margin')
  assert.match(row[0].body, /margin-block:\s*0\s*!important/)
})

test('no footer rule hides behind the aria-modal guard', () => {
  // The drawer is the modal, so a `:not([aria-modal="true"] *)` footer rule can
  // never apply on a phone. This is the trap that cost the footer its styling.
  const guarded = ruleBlocks(css).filter(
    (rule) => rule.selector.includes('_footArea') && rule.selector.includes(':not([aria-modal="true"] *)'),
  )
  assert.deepEqual(guarded.map((rule) => rule.selector.trim()), [], 'a footer rule guarded on aria-modal is dead in the drawer')
})

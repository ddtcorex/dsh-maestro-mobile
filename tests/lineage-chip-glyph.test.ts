import assert from 'node:assert/strict'
import test from 'node:test'

import { LAYOUT_CSS } from '../src/client/styles/layout.css.ts'
import { stripCssComments } from '../scripts/strip-css-comments.mjs'

// The compact lineage badge must keep upstream's glyph.
//
// History: the collapse rule was written against an upstream trigger whose
// glyph was a bare `<svg>` sibling of the "N subagents" sentence, so hiding the
// direct `<span>` children removed the sentence and left the chevron. 0.2.2
// wrapped the glyph in `span.ZKlsPq_activitySlot` (with the running StateDot
// beside it) and put the sentence in `span.ZKlsPq_count`, so `> span` hid BOTH:
// the trigger became an empty 28px circle whose only content is the plugin's own
// count pill, and the users glyph disappeared (measured live 2026-11-20 on
// 0.2.2-rc.5 at 390px, dark and light: `span.ZKlsPq_activitySlot` display none,
// `svg[data-icon="dsw-icon-users-outline-regular"]` rect 0x0).
//
// The rule now hides the sentence by what it IS (a span with no glyph of its
// own, plus upstream's own `data-subagent-count` marker) and never the slot that
// carries the glyph.
const css = stripCssComments(LAYOUT_CSS)

test('the lineage collapse hides the count sentence, never the glyph slot', () => {
  const collapse = /\[data-mobile-nav="lineage"\]\s*>\s*([^{]+)\{([\s\S]*?)\}/.exec(css)
  assert.ok(collapse, 'the lineage collapse rule is missing from layout.css.ts')
  const [, selector, body] = collapse
  assert.match(body, /display:\s*none\s*!important/, 'the collapse rule no longer hides anything')
  // The sentence is hidden by upstream's own marker and by being glyph-less.
  assert.match(selector, /\[data-subagent-count\]/, 'the count sentence is not hidden by its upstream marker')
  assert.match(selector, /span:not\(:has\(> svg\)\)/, 'a glyph-less span (the sentence) is not covered')
  // A blanket `> span` rule is exactly the regression: it hides the activity
  // slot that carries the users glyph.
  assert.doesNotMatch(selector, /^\s*span\s*$/, 'a blanket direct-span rule hides the glyph slot too')
})

test('the glyph slot is laid out as the badge content', () => {
  // Upstream's own slot is 14px inline-flex; on the phone the trigger is our
  // 28px circle, so the slot must stay a centered flex box and keep its own
  // 15px glyph box rather than collapse to the sentence geometry.
  const slot = /\[data-mobile-nav="lineage"\]\s*>\s*span:has\(> svg\)\s*\{([\s\S]*?)\}/.exec(css)
  assert.ok(slot, 'the glyph slot rule is missing from layout.css.ts')
  assert.match(slot[1], /display:\s*inline-flex\s*!important/)
  assert.match(slot[1], /align-items:\s*center\s*!important/)
  assert.match(slot[1], /justify-content:\s*center\s*!important/)
})

test('the running spinner takes the badge slot and the users glyph steps aside', () => {
  // StateDot renders for a RUNNING subagent, and it is not a dot: upstream
  // renders a 14px animated SVG spinner (`svg[data-state="ongoing"]`, 1.5s
  // rotation, track plus dash arc) next to the users glyph inside the same
  // activity slot (measured live on 0.2.2-rc.5 at 390px, 2026-11-21). A 28px
  // circle holds one glyph, so the spinner takes the slot while it runs and the
  // users icon steps aside. Both rules anchor on upstream's own `data-state`
  // marker, so no hash and no locale is involved.
  const running = /\[data-mobile-nav="lineage"\]\s*>\s*span:has\(> svg\[data-state="ongoing"\]\)\s*>\s*svg\[data-state="ongoing"\]\s*\{([\s\S]*?)\}/.exec(css)
  assert.ok(running, 'the running spinner rule is missing from layout.css.ts')
  assert.match(running[1], /display:\s*block\s*!important/)
  assert.match(running[1], /width:\s*15px\s*!important/)
  assert.match(running[1], /height:\s*15px\s*!important/)
  // The users icon is the sibling WITHOUT a data-state marker; it must yield.
  const idle = /\[data-mobile-nav="lineage"\]\s*>\s*span:has\(> svg\[data-state="ongoing"\]\)\s*>\s*svg:not\(\[data-state\]\)\s*\{([\s\S]*?)\}/.exec(css)
  assert.ok(idle, 'the rule that yields the slot to the spinner is missing')
  assert.match(idle[1], /display:\s*none\s*!important/)
  // A blanket hide on the activity fragment would kill the spinner again, which
  // is exactly what the first fix did: pinned so it cannot come back.
  assert.doesNotMatch(css, /_textModeActivity[^{]*\{[^}]*display:\s*none/,
    'the blanket running-dot hide is back; it hides the spinner and the badge stops showing activity')
  // Idle keeps the users glyph: no rule may hide it unconditionally.
  assert.doesNotMatch(css, /\[data-mobile-nav="lineage"\][^{]*\{[^}]*svg\[data-icon[^{]*display:\s*none/,)
})

test('the compact badge geometry itself is unchanged', () => {
  // Guard the design the fix must not undo: a 28px circle carrying the count
  // as a corner pill built from the marked attribute.
  const trigger = /\[data-mobile-nav="lineage"\]\s*\{([\s\S]*?)\}/.exec(css)
  assert.ok(trigger, 'the lineage trigger rule is missing')
  assert.match(trigger[1], /width:\s*28px\s*!important/)
  assert.match(trigger[1], /height:\s*28px\s*!important/)
  assert.match(trigger[1], /border-radius:\s*999px\s*!important/)
  assert.match(css, /content:\s*attr\(data-lineage-count\)\s*!important/)
})

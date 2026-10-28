import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { tabsEdgeState } from '../src/client/effects/settings-tabs-edges.ts'

/**
 * Settings sheet geometry on a phone, measured live at 390x844 against
 * DSH 0.2.2-alpha.2 before this change:
 *
 *   content column (the scroll area's padding)       left = 17
 *   title "Settings"                                 left =  5   (-12)
 *   "Open configuration file"                        left = 21   (+4)
 *   first tab pill "General"                         left = 33   (+16)
 *   search field "Search plugins"                    left = 17   (  0)
 *   "Session plugins" label / its caption            left = 37   (+20)
 *
 * Five different left edges in one sheet: the upstream nav title, the nav list
 * and the plugin's own nav wrapper each added their own padding. The nav list
 * also carried 1186px of tabs inside a 356px viewport with its scrollbar hidden
 * and no edge affordance, so "Built-in plugins" was clipped at the right edge
 * and six tabs were invisible until the user guessed they could scroll sideways.
 *
 * The contracts below pin the alignment (one 16px inset for title, tabs and
 * list) and the edge affordance (a fade only on a side that is actually cut).
 */

const stylesDir = new URL('../src/client/styles/', import.meta.url)
const read = (path: string): string => readFileSync(new URL(path, stylesDir), 'utf8')

/** Strip block comments so prose can never satisfy a selector assertion. */
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '')

const settings = stripComments(read('settings-sheet.css.ts'))

/** The body of the first rule whose selector matches `pattern`. */
function ruleBody(css: string, pattern: RegExp): string {
  const match = pattern.exec(css)
  assert.ok(match, `rule not found: ${pattern}`)
  return match[1] ?? ''
}

const panelRule = ruleBody(settings, /\[class\*="_panel"\]:has\(\[class\*="_navList"\]\)\s*\{([^}]*)\}/)
const titleRule = ruleBody(settings, /\[class\*="_panel"\]:has\(\[class\*="_navList"\]\) \[class\*="_navTitle"\]\s*\{([^}]*)\}/)
const listRule = ruleBody(settings, /\[class\*="_panel"\]:has\(\[class\*="_navList"\]\) \[class\*="_navList"\]\s*\{([^}]*)\}/)

test('the sheet panel stacks as a column instead of the host grid', () => {
  // 0.2.2 lays the panel out as a grid with areas
  //   "title header" / "nav nav" / "options options" and columns 352px 36px.
  // The sheet overrides only set flex-direction, which a grid ignores, so the
  // panel stayed a grid and the drag-handle ::before was auto-placed into the
  // 36px "header" cell: the grabber rendered as a stray grey bar under the
  // close button instead of a centred 36x4 handle above the title.
  assert.match(panelRule, /display:\s*flex\s*!important/)
  assert.match(panelRule, /flex-direction:\s*column\s*!important/)
  assert.match(panelRule, /grid-template-areas:\s*none\s*!important/)
  assert.match(panelRule, /grid-template-columns:\s*none\s*!important/)
})

test('the sheet panel is sized border-box so the 720px cap is the real height', () => {
  // Without it the panel measured 731px: 720 + 10px padding-top + 1px border.
  assert.match(panelRule, /box-sizing:\s*border-box\s*!important/)
})

test('title, tab strip and list share the content column inset', () => {
  // Title: leading inset 16 (it also reserves 44 on the right for the close
  // button). List: no horizontal padding of its own, the scroll area already
  // pads the column.
  assert.match(titleRule, /padding:\s*0 44px 2px 16px\s*!important/)
  assert.match(listRule, /padding:\s*12px 0 6px\s*!important/)
})

test('the "Open configuration file" action sits on the content column', () => {
  // The header row lives inside the nav title, so its own horizontal padding
  // would stack on the title's: measured 33 vs the 17 column before this rule.
  const headerRule = ruleBody(settings, /\[class\*="_panel"\]:has\(\[class\*="_navList"\]\) \[class\*="_header"\]\s*\{([^}]*)\}/)
  assert.match(headerRule, /padding:\s*4px 0[^;]*!important/)
})

test('the tab strip fades only on an edge that is cut', () => {
  // Two masks driven by the edges effect: no fade on a side that reaches the
  // end, otherwise the last pill looks truncated even when it is not.
  for (const state of ['both', 'end', 'start']) {
    assert.match(
      settings,
      new RegExp(`\\[class\\*="_navList"\\]\\[data-mobile-nav-tabs="${state}"\\]\\s*\\{[^}]*mask-image:`),
      `the "${state}" state must fade its cut edge`,
    )
  }
})

test('a settings row control shrinks instead of overflowing the sheet', () => {
  // Measured at 390px: the "Session plugins" row's right-hand control
  // (.headerEnd > .switcher, "Sutunam Creator (default)") was 351px wide and
  // ended at x=494 inside a content box ending at x=389. The content area
  // therefore scrolled sideways (scrollWidth 493 vs clientWidth 383) and the
  // chip was clipped at the sheet edge.
  assert.match(settings, /\[class\*="_options"\]\s*\{[^}]*overflow-x:\s*hidden\s*!important/, 'the content column must not scroll sideways')
  assert.match(settings, /\[class\*="headerEnd"\][^{]*\{[^}]*min-width:\s*0\s*!important/, 'the row end must be shrinkable')
  assert.match(settings, /\[class\*="switcher"\][^{]*\{[^}]*max-width:\s*100%\s*!important/, 'the switcher must be capped to the row')
})

test('the close button keeps its 36px face but a 44px tap area', () => {
  const closeRule = ruleBody(settings, /\[class\*="_panel"\]:has\(\[class\*="_navList"\]\) \[class\*="_close"\]\s*\{([^}]*)\}/)
  assert.match(closeRule, /width:\s*36px\s*!important/)
  assert.match(settings, /\[class\*="_close"\]::after\s*\{[^}]*inset:\s*-4px\s*!important/, 'the tap area must extend past the face')
})

// --- edges predicate -------------------------------------------------------

test('a strip shorter than its viewport has no cut edges', () => {
  assert.deepEqual(tabsEdgeState({ scrollLeft: 0, scrollWidth: 300, clientWidth: 356 }), 'none')
})

test('a strip at its start cuts only the right edge', () => {
  assert.deepEqual(tabsEdgeState({ scrollLeft: 0, scrollWidth: 1186, clientWidth: 356 }), 'end')
})

test('a strip scrolled to the end cuts only the left edge', () => {
  assert.deepEqual(tabsEdgeState({ scrollLeft: 830, scrollWidth: 1186, clientWidth: 356 }), 'start')
})

test('a strip scrolled into the middle cuts both edges', () => {
  assert.deepEqual(tabsEdgeState({ scrollLeft: 300, scrollWidth: 1186, clientWidth: 356 }), 'both')
})

test('sub-pixel scroll positions are honoured at the ends', () => {
  // Touch scrolling lands on fractional offsets; a 1px tolerance would flip the
  // fade on and off at the end of the strip.
  assert.deepEqual(tabsEdgeState({ scrollLeft: 829.5, scrollWidth: 1186, clientWidth: 356 }), 'start')
  assert.deepEqual(tabsEdgeState({ scrollLeft: 0.5, scrollWidth: 1186, clientWidth: 356 }), 'end')
})

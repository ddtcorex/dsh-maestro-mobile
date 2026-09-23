import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'

/**
 * The 768-1023px tier is the leak surface this test locks down.
 *
 * The mobile shell is one pointer-gated branch (`max-width: 1023px` AND
 * `pointer: coarse`); the tablet tier is a narrower override of the same rules
 * at 768px and up. Two source patterns break the boundary:
 *
 * 1. A bare `@media (min-width: 768px)` block drops the max-width and pointer
 *    halves, so the tablet geometry (a value measured on a phone) would also
 *    apply to a 1280px mouse-driven desktop window -- the regression the plugin
 *    exists to avoid.
 * 2. Both blocks have the same specificity, so within one file the later block
 *    wins: a tablet override emitted before the mobile gate in the same file is
 *    silently dead.
 *
 * This is the cheap half of scripts/probes/multi-width-layout-probe.mjs: it
 * reads source text and runs in milliseconds, but it can only see what the
 * source says. The probe is the other half -- it measures real rects, real
 * overflow, and the rendered host icon in Chrome at all seven widths. Keep both:
 * this test catches a leak in CI without a browser, and the probe catches the
 * failures that have no source shape (a gate that never arms, an icon resolver
 * that resolves to nothing).
 *
 * Assertions already owned by tests/pointer-gating.test.ts are intentionally not
 * repeated here: that file checks the reverse media-query direction (every
 * `max-width: 1023px` query requires a coarse pointer), the shared MOBILE_QUERY
 * constant, and the complement's presence in misc.css.ts.
 */

const stylesDir = new URL('../src/client/styles/', import.meta.url)
const read = (path: string): string => readFileSync(new URL(path, stylesDir), 'utf8')

/**
 * Strip block comments before matching: a comment mentioning a breakpoint must
 * never satisfy (or fail) a selector or media-query assertion. Same guard the
 * other CSS contract tests use.
 */
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '')

const STYLE_FILES = readdirSync(stylesDir).filter((name) => name.endsWith('.css.ts')).sort()

const MOBILE_GATE = '@media (max-width: 1023px) and (pointer: coarse)'
const TABLET_MIN_WIDTH = 'min-width: 768px'

test('every 768px media query also caps the width and requires a coarse pointer', () => {
  assert.ok(STYLE_FILES.length > 0, 'expected at least one stylesheet module')
  for (const file of STYLE_FILES) {
    const css = stripComments(read(file))
    for (const [, query] of css.matchAll(/@media([^{]+)\{/g)) {
      if (!query.includes(TABLET_MIN_WIDTH)) continue
      assert.match(query, /max-width: 1023px/, `${file}: "${query.trim()}" must also cap at 1023px`)
      assert.match(query, /pointer: coarse/, `${file}: "${query.trim()}" must require (pointer: coarse)`)
    }
  }
})

test('the tablet override follows the mobile gate in the same file', (context) => {
  // Same specificity, so only source order decides: the tablet block must come
  // after the gate it narrows.
  for (const file of ['sheet.css.ts', 'settings-sheet.css.ts']) {
    const css = stripComments(read(file))
    const tabletIndex = css.indexOf(TABLET_MIN_WIDTH)
    if (tabletIndex === -1) {
      context.diagnostic(`${file}: no tablet block, nothing to order`)
      continue
    }
    const gateIndex = css.indexOf(MOBILE_GATE)
    if (gateIndex === -1) {
      // A tablet-only file has no same-specificity mobile rule inside it, so
      // there is no in-file order to invert. Recorded rather than asserted with
      // a vacuous -1 < index comparison.
      context.diagnostic(`${file}: tablet block without a mobile gate in the same file`)
      continue
    }
    assert.ok(
      gateIndex < tabletIndex,
      `${file}: the ${TABLET_MIN_WIDTH} override must come after the mobile gate`,
    )
  }
})

test('the desktop complement stays in misc.css.ts after the tablet override', () => {
  // tests/pointer-gating.test.ts owns "the complement exists at all"; this adds
  // the position that file does not check. A complement emitted before the
  // 768-1023 block would be overridden by it at equal specificity.
  const css = stripComments(read('misc.css.ts'))
  const complementIndex = css.indexOf('@media (min-width: 1024px), (pointer: fine), (pointer: none)')
  assert.ok(complementIndex >= 0, 'misc.css.ts must keep the desktop complement')
  const tabletIndex = css.indexOf(TABLET_MIN_WIDTH)
  assert.ok(tabletIndex >= 0, 'misc.css.ts must keep the tablet override')
  assert.ok(complementIndex > tabletIndex, 'the desktop complement must close the file after the tablet block')
})

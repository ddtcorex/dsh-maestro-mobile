import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { MOBILE_CSS } from '../src/client/styles/index.ts'

const misc = readFileSync(new URL('../src/client/styles/misc.css.ts', import.meta.url), 'utf8')

/**
 * Effort grade panel shrink-wrap (port of dsh-web-mobile v3.0.6 PR #205).
 *
 * Measured live at 390px (touch emulation on): the grade shell
 * (`role=menu`, direct `menuitemradio` children Default…Xhigh) computed
 * 248px wide for ~10-char labels because the host holds every menu at
 * min-width:240px. The rule below shrink-wraps only that shell; the model
 * catalog shell holds `menuitem` rows so it never matches and keeps the
 * host size.
 */
test('the effort grade panel is shrink-wrapped by its unique radio shell', () => {
  assert.match(
    misc,
    /div\[role="menu"\]:has\(> \[role="menuitemradio"\]\)/,
    'the grade shell must be matched by role=menu with direct menuitemradio children',
  )
  assert.match(misc, /min-width: 0 !important/)
  assert.match(misc, /width: max-content !important/)
})

test('the shrink-wrap ships in the emitted stylesheet', () => {
  assert.ok(
    MOBILE_CSS.includes('div[role="menu"]:has(> [role="menuitemradio"])'),
    'the grade-panel rule must reach the injected <style> tag',
  )
})

test('the model catalog keeps the host width', () => {
  // No bare `[role="menu"]` width/min-width override may exist: the model
  // directory must keep the host 240px. The only menu width rule is the
  // radio-gated one above.
  const widthRules = [...misc.matchAll(/\[role="menu"\][^{]*\{[^}]*\b(min-width|width)\s*:/g)]
    .filter((m) => !m[0].includes('menuitemradio') && !m[0].includes('max-height'))
  assert.deepEqual(
    widthRules.map((m) => m[0]),
    [],
    'no width rule may target a bare role=menu shell',
  )
})

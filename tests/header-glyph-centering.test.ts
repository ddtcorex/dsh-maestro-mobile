import assert from 'node:assert/strict'
import test from 'node:test'

import { MOBILE_CSS } from '../src/client/styles/index.ts'

/**
 * No header glyph may be optically nudged.
 *
 * A nudge is a translate tuned for ONE icon's ink, and it is keyed on the band
 * that icon lived in, not on the icon. The 2026-09-22 nudge was tuned for the
 * host Files arrow inside `headerUtilities`; upstream later moved that action
 * out of the band and the Session panel toggle moved in, so the same rule
 * shifted a flat-list glyph whose ink is already symmetrical (ink bbox centre
 * 8.05, 8.0 in a 16x16 viewBox) by (1px, -2px). On a phone that reads as "the
 * header icons are not on one line".
 *
 * The invariant below is the class, not the instance: the plugin never
 * transforms a glyph inside a session header button. Encoding a vertical
 * position belongs to the button's own flex centring, which the host and the
 * plugin both already provide.
 */
const glyphTransformRules = (css) =>
  [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter((match) => /conversation\.session\.header/.test(match[1]))
    .filter((match) => /\bbutton\b/.test(match[1]) && /\bsvg\b/.test(match[1]))
    .filter((match) => /(^|[\s;])transform\s*:/.test(match[2]))
    .map((match) => `${match[1].trim()} { ${match[2].trim()} }`)

test('no rule transforms a glyph inside a session header button', () => {
  assert.deepEqual(
    glyphTransformRules(MOBILE_CSS),
    [],
    'a header glyph may not be translated: a nudge outlives the icon it was tuned for',
  )
})

test('the Files-arrow nudge is gone from the emitted stylesheet', () => {
  assert.equal(
    MOBILE_CSS.includes('translate(1px, -2px)'),
    false,
    'that nudge was tuned for the Files arrow, and its band now holds the session-panel toggle',
  )
})

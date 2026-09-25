import assert from 'node:assert/strict'
import test from 'node:test'

import { MOBILE_CSS } from '../src/client/styles/index.ts'

/**
 * Selectors the browser DROPS must never reach the emitted stylesheet.
 *
 * A stylesheet is not validated at author time: when Chrome rejects a selector
 * it silently drops the entire rule, so the declarations never apply while every
 * source-text assertion in the suite keeps passing. That is how the Settings
 * bottom sheet stayed a floating centred card for four weeks unnoticed —
 * `[class*="_overlay"]:has([class*="_panel"]:has([class*="_navList"]))`
 * (settings-sheet.css.ts) is invalid, because `:has()` may not be nested inside
 * `:has()`, and the four rules anchored on it were dropped whole. Measured in
 * Chrome 154: the rule is absent from `document.styleSheets[0].cssRules` while
 * the source text still holds it.
 *
 * This test scans MOBILE_CSS — the exact string the plugin injects into its
 * `<style>` tag — rather than the TS sources, so prose in a code comment can
 * never satisfy or fail it, and every concatenated section is covered by
 * construction.
 *
 * It is the CI half of the guard. The other half is
 * scripts/probes/settings-sheet-probe.mjs, which opens Settings in a real
 * browser and asserts the rules actually landed in the CSSOM and the sheet is
 * bottom-anchored: a text scan can only see what the text says, and "the
 * browser rejected it" is precisely what text cannot see.
 */

/** Drop CSS comments, which the browser discards and which carry no selector. */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * Every `:has(...)` whose own argument list contains another `:has(`.
 * Uses balanced parens rather than a regex: a regex cannot see nesting depth,
 * and "nested" is exactly a depth property.
 * @param css - comment-stripped stylesheet text.
 * @returns the offending substrings, as written.
 */
export function nestedHasSelectors(css: string): string[] {
  const found: string[] = []
  const needle = ':has('
  for (let at = css.indexOf(needle); at !== -1; at = css.indexOf(needle, at + 1)) {
    let depth = 0
    let end = -1
    for (let i = at + needle.length - 1; i < css.length; i++) {
      if (css[i] === '(') depth++
      else if (css[i] === ')') {
        depth--
        if (depth === 0) { end = i; break }
      }
    }
    if (end === -1) continue
    const inner = css.slice(at + needle.length, end)
    if (inner.includes(needle)) found.push(css.slice(at, end + 1))
  }
  return found
}

test('the emitted stylesheet contains no nested :has()', () => {
  const offenders = nestedHasSelectors(withoutComments(MOBILE_CSS))
  assert.deepEqual(
    offenders,
    [],
    'Chrome rejects :has() inside :has() with a SyntaxError and drops the whole rule, so the '
    + 'declarations silently never apply. Flatten to a single-level :has() (e.g. '
    + '[class*="_overlay"]:has([class*="_navList"])) or move the inner test to a descendant '
    + `compound. Offenders:\n${offenders.join('\n')}`,
  )
})

test('the Settings overlay guard is present in its flattened form', () => {
  // The positive pin: the fix is not "delete the offending rules". If a later
  // refactor drops or re-nests them, one assertion or the other fails.
  assert.ok(
    withoutComments(MOBILE_CSS).includes('[class*="_overlay"]:has([class*="_navList"])'),
    'the flattened Settings overlay guard must still ship',
  )
})

test('the nesting detector actually detects nesting', () => {
  // A guard that cannot fail is worthless: prove it fires on the real shape and
  // stays quiet on the flattened one, on a descendant compound, and in comments.
  assert.equal(nestedHasSelectors(withoutComments('a:has(b:has(c)) { color: red }')).length, 1)
  assert.equal(nestedHasSelectors(withoutComments('a:has(c) { color: red }')).length, 0)
  assert.equal(nestedHasSelectors(withoutComments('a:has(> b) c { color: red }')).length, 0)
  assert.equal(nestedHasSelectors(withoutComments('a:has(b) :has(c) { color: red }')).length, 0)
  assert.equal(nestedHasSelectors(withoutComments('/* a:has(b:has(c)) */ a { color: red }')).length, 0)
})

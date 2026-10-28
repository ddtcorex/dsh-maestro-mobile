import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

/**
 * A reachable session-header directory toggle, placed on the composer gutter.
 *
 * DSH 0.2.2-alpha.2 renders the header actions inside `div.wSkVaW_titleCluster`,
 * which paints through a `mask-image` fade. A mask limits painting AND
 * hit-testing to the mask's own box, so a control absolutely positioned 8px to
 * the left of that box (the gutter the design asks for, x=16 at 390px) was
 * neither painted nor tappable: `pnpm smoke:cdp` reported
 * `FAIL mobile.open-control`.
 *
 * Measured live at 390x844 with a real session open, four states of the same
 * button:
 *
 *   in flow (x=208, no absolute)                -> svg HIT
 *   absolute left:-8px (x=16), mask + clip      -> div MISS
 *   absolute left:-8px (x=16), mask off, clip   -> svg HIT
 *   absolute left:-8px (x=16), mask off, no clip -> svg HIT
 *
 * The mask is the blocker; `overflow: clip` is not. So the fix keeps the
 * intended geometry and turns the cluster's fading mask off on the phone branch
 * only. Nothing bleeds: the crumbs nav carries its own `overflow: hidden` and
 * truncates the title inside its own box, which is why removing the decorative
 * fade cannot push text under the utilities or the corner.
 *
 * These assertions are source shapes; the behavioural half is the hit-test the
 * contract scan performs (`kind: "interactive"`) and `pnpm smoke:cdp`.
 */

const stylesDir = new URL('../src/client/styles/', import.meta.url)
const read = (path: string): string => readFileSync(new URL(path, stylesDir), 'utf8')

/** Strip block comments so prose can never satisfy a selector assertion. */
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '')

const PHONE_QUERY = '@media (max-width: 1023px) and (pointer: coarse)'

/**
 * Contents of every phone-tier block in one file, concatenated. The sheet is
 * split into several phone blocks on purpose (one per domain), so a test that
 * reads only the first one cannot see the header rules.
 * @param css - comment-stripped stylesheet source.
 * @returns the concatenated block bodies.
 */
function phoneBranches(css: string): string {
  const bodies: string[] = []
  let from = 0
  for (;;) {
    const start = css.indexOf(PHONE_QUERY, from)
    if (start === -1) break
    const open = css.indexOf('{', start)
    if (open === -1) break
    let depth = 0
    let end = open
    for (; end < css.length; end++) {
      if (css[end] === '{') depth++
      else if (css[end] === '}') {
        depth--
        if (depth === 0) break
      }
    }
    bodies.push(css.slice(open + 1, end))
    from = end + 1
  }
  return bodies.join('\n')
}

const phone = phoneBranches(stripComments(read('layout.css.ts')))
assert.ok(phone.length > 0, 'the phone branch must exist')

test('the phone branch turns the title cluster mask off', () => {
  // Both spellings: a build that ships only the prefixed property would
  // otherwise keep the control dead with no visible change in the source.
  assert.match(
    phone,
    /\[class\*="_titleCluster"\]\s*\{[^}]*-webkit-mask-image:\s*none\s*!important/,
    'the cluster must drop its -webkit-mask on phones',
  )
  assert.match(
    phone,
    /\[class\*="_titleCluster"\]\s*\{[^}]*mask-image:\s*none\s*!important/,
    'the cluster must drop its mask on phones',
  )
})

test('the toggle keeps the far-left gutter geometry', () => {
  // x=16 at 390px: the row starts at x=24, so the control juts 8px left of it
  // and lands on the composer's gutter line.
  assert.match(
    phone,
    /\[data-mobile-nav="frame"\] \[data-phase\] \[data-slot="conversation\.session\.header"\] \[data-mobile-nav="toggle"\]\s*\{[^}]*left:\s*-8px\s*!important/,
    'the toggle must sit 8px left of the header row',
  )
  assert.match(
    phone,
    /\[data-mobile-nav="frame"\] \[data-phase\] \[data-slot="conversation\.session\.header"\] \[data-mobile-nav="toggle"\]\s*\{[^}]*top:\s*50%\s*!important/,
    'the toggle must center against the row box',
  )
})

test('the toggle keeps a fixed 28px hit target', () => {
  const base = stripComments(read('base.css.ts'))
  assert.match(base, /\[data-mobile-nav="toggle"\]\s*\{[^}]*width:\s*28px/)
  assert.match(base, /\[data-mobile-nav="toggle"\]\s*\{[^}]*height:\s*28px/)
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

/**
 * A reachable session-header directory toggle, on the header generation DSH
 * 0.2.2-alpha.2 ships.
 *
 * Measured live at 390x844 with touch emulation and a real session open: the
 * toggle's own box was x=16..44 while its ancestors are
 * `div.wSkVaW_titleCluster` (x=36..356) and `div.wSkVaW_titleRow` (x=24..366).
 * The cluster paints through a `mask-image` fade, and a mask limits painting to
 * its own box, so the part of the button that juts left of the cluster is never
 * painted. `document.elementFromPoint` therefore resolved to the title row at
 * the button's centre and to the header and the cluster at its corners: every
 * point of the control was dead. Two runtime experiments isolated the cause:
 * forcing `overflow: visible` on the cluster changed nothing, while removing its
 * mask made the hit resolve to the button's own `svg`. `pnpm smoke:cdp` reports
 * this as `FAIL mobile.open-control`.
 *
 * The fix is to stop fighting the ancestors: the toggle is registered into the
 * header actions band and stays in flow there, as the band's first resident,
 * instead of being absolutely positioned out of it.
 *
 * These assertions are source shapes (cheap, run in CI without a browser); the
 * behavioural half is `pnpm smoke:cdp`, which hit-tests the control's centre.
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

/** Every rule body whose selector names the directory toggle. */
function toggleRules(css: string): string[] {
  return [...css.matchAll(/([^{}]*\[data-mobile-nav="toggle"\][^{}]*)\{([^}]*)\}/g)]
    .map((match) => `${match[1]?.replace(/\s+/g, ' ').trim()} {${match[2]}}`)
}

const rules = toggleRules(phone)

test('no phone rule absolutely positions the header toggle out of its band', () => {
  // An absolutely positioned toggle lands outside the masked title cluster on
  // 0.2.2-alpha.2, which makes it invisible and untappable.
  const absolute = rules.filter((rule) => /position:\s*absolute/.test(rule))
  assert.deepEqual(absolute, [], `the toggle must stay in flow; found: ${absolute.join(' | ')}`)
})

test('the toggle keeps a fixed 28px hit target in the header band', () => {
  const base = stripComments(read('base.css.ts'))
  assert.match(base, /\[data-mobile-nav="toggle"\]\s*\{[^}]*width:\s*28px/)
  assert.match(base, /\[data-mobile-nav="toggle"\]\s*\{[^}]*height:\s*28px/)
})

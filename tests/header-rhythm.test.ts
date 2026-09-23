import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const layout = readFileSync(new URL('../src/client/styles/layout.css.ts', import.meta.url), 'utf8')
// Comment text can satisfy a selector or declaration assertion, so match against
// the declarations only (docs/maintenance/pitfalls.md).
const css = layout.replace(/\/\*[\s\S]*?\*\//g, '')

/** The 0.1.7 actions-cluster rule body (the band's own flex container). */
function bandRule(): string {
  // Anchored without `> header`: the pre-0.1.7 twin above it matches no div and
  // keeps its own 2px gap, so an unanchored match would read that stale rule.
  const match = /conversation\.session\.header"\] \[class\*="_headerActions"\] \{([\s\S]*?)\n  \}/.exec(css)
  assert.ok(match, 'the actions-cluster rule is missing from layout.css.ts')
  return match[1] as string
}

test('the header actions cluster spaces every resident with one gap', () => {
  // Measured live at 390px on 0.1.7 with a lineage chip, a live jobs chip and
  // the mode icon in the band: the 2px band gap plus a 6px gutter on trigger
  // roots painted 8px before a chip and 2px after it, so the row of icons read
  // unevenly (mobile report 2026-09-24). One gap for every resident — and no
  // per-root gutter inside the band — is what makes them even.
  const body = bandRule()
  assert.match(body, /gap: 8px;/)
  assert.doesNotMatch(body, /gap: 2px;/)
  assert.doesNotMatch(
    css,
    /conversation\.session\.header"\] \[class\*="_root"\][^{]*\{\s*margin-left: 6px/,
  )
  // The gutter survives where a lineage chip sits beside a crumb's own title:
  // the crumbs lane has only its own 2px gap.
  assert.match(
    css,
    /\[class\*="_crumbs"\] \[class\*="_root"\]:not\(\[class\*="_switcherRoot"\]\):has\(> button\[class\*="_trigger"\]\) \{\s*margin-left: 6px/,
  )
})

test('the header actions cluster never shrinks below its residents', () => {
  // With the default shrink factor the band compressed 54px of residents into
  // 51.4px and slid its first chip under its own left edge, over the session
  // title — the slide the crowding rules exist to prevent. The crumbs lane is
  // the flexible one by design, so a crowded header ellipsizes the title.
  const body = bandRule()
  assert.match(body, /flex: 0 0 auto;/)
  assert.doesNotMatch(body, /flex: 0 1 auto;/)
})

test('a crowded title keeps the header rhythm as its floor', () => {
  // The actions cluster is right-pinned, so the cluster's own gap decides only
  // how close a crowded title may come to the first chip; at 2px the title and
  // the leading chip touched.
  const match = /conversation\.session\.header"\] > div:first-child > :first-child:not\(\[data-conversation-header-corner\]\) \{([\s\S]*?)\n  \}/.exec(css)
  assert.ok(match, 'the title-cluster rule is missing from layout.css.ts')
  assert.match(match[1] as string, /gap: 8px;/)
})

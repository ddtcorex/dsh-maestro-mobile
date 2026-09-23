import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { lineageCountFromLabel } from '../src/client/effects/lineage-badge.ts'

const layout = readFileSync(new URL('../src/client/styles/layout.css.ts', import.meta.url), 'utf8')
const effect = readFileSync(new URL('../src/client/effects/lineage-badge.ts', import.meta.url), 'utf8')

test('the lineage badge count comes from the trigger accessible name', () => {
  // Upstream keeps the localized sentence ("1 subagent") as the trigger's
  // aria-label, and the compact mobile control hides that text but must
  // still show the number. The label is the only place the count survives
  // once the sentence is hidden, and it is localized, so read the leading
  // integer rather than any surrounding word.
  assert.equal(lineageCountFromLabel('1 subagent'), 1)
  assert.equal(lineageCountFromLabel('3 subagents'), 3)
  assert.equal(lineageCountFromLabel('12 subagents running'), 12)
  assert.equal(lineageCountFromLabel('2 个子代理'), 2)
  assert.equal(lineageCountFromLabel('subagents'), 0)
  assert.equal(lineageCountFromLabel(''), 0)
  assert.equal(lineageCountFromLabel(null), 0)
  assert.equal(lineageCountFromLabel(undefined), 0)
})

test('the reconciler marks only the header lineage trigger', () => {
  // 0.1.7 moved the triggers out of the crumbs nav into the title cluster
  // (measured live: no header button has a [class*="_crumbs"] ancestor), so
  // the old crumbs scope misses and the trigger never collapses. Scope to
  // the header seat instead. Uniqueness still holds: the lineage trigger is
  // the only accordion in the seat with aria-haspopup="tree" — the session
  // switcher beside it carries no popup attributes, and the plugin's own
  // drawer toggle lives in the header actions slot.
  assert.match(effect, /\[data-slot="conversation\.session\.header"\]/)
  assert.doesNotMatch(effect, /\[class\*="_crumbs"\]/)
  assert.match(effect, /button\[class\*="_trigger"\]\[aria-haspopup="tree"\]/)
})

test('the compact control removes its markers so desktop stays a no-op', () => {
  // Writes go through setMarker (core/dom-marks.ts) so a steady state writes
  // nothing: the task re-runs on every flush and the observer watches attributes,
  // so an unconditional write is a self-sustaining frame loop.
  assert.match(effect, /setMarker\(trigger, 'data-mobile-nav', 'lineage'\)/)
  assert.match(effect, /setMarker\(\s*trigger,\s*'data-lineage-count',/)
  assert.doesNotMatch(effect, /trigger\.setAttribute\(/)
  assert.match(effect, /removeAttribute\('data-mobile-nav'\)/)
  assert.match(effect, /removeAttribute\('data-lineage-count'\)/)
})

test('the chip box carries the marker the hover swallow scopes to', () => {
  // subagent-chip-touch.ts bounds its synthetic-hover swallow to the chip box and
  // its portalled catalog. Naming the box with upstream's CSS-module hash of the
  // day stopped matching on 0.1.7 (all four literals matched nothing live, while
  // the box is `IwR9Qa_root` and its catalog `IwR9Qa_menu`), so the box carries
  // this plugin's own marker — and exactly one box at a time, because a React
  // re-render can reparent the trigger and a marker left behind would widen the
  // scope the swallow exists to bound.
  assert.match(effect, /scopeTo\(trigger\.parentElement\)/)
  assert.match(effect, /setMarker\(root, 'data-lineage-root', ''\)/)
  assert.match(effect, /if \(scoped !== null\) scoped\.removeAttribute\('data-lineage-root'\)/)
  assert.match(effect, /scopeTo\(null\)/)
  assert.match(effect, /if \(scoped === root\) return/)
})

test('the lineage control collapses to a 28px icon button with a count badge', () => {
  // The upstream trigger pins its full sentence at max-content width:
  // measured 81x28px inside a 390px header, which crushed the session
  // title (switcher) to 16px. The compact form is the same 28px circle as
  // the drawer, right-sidebar and jobs controls, with the count as a badge.
  const trigger = /\[data-mobile-nav="lineage"\] \{([\s\S]*?)\n  \}/.exec(layout)?.[1]
  assert.ok(trigger, 'the compact lineage control rule is missing from layout.css.ts')
  assert.match(trigger, /width: 28px !important;/)
  assert.match(trigger, /height: 28px !important;/)
  assert.match(trigger, /border-radius: 999px !important;/)

  const hidden = /\[data-mobile-nav="lineage"\] > span \{([\s\S]*?)\n  \}/.exec(layout)?.[1]
  assert.ok(hidden, 'the hidden-sentence rule is missing')
  assert.match(hidden, /display: none !important;/)

  const badge = /\[data-mobile-nav="lineage"\]::after \{([\s\S]*?)\n  \}/.exec(layout)?.[1]
  assert.ok(badge, 'the count badge rule is missing')
  assert.match(badge, /content: attr\(data-lineage-count\)/)
  assert.match(badge, /position: absolute !important;/)
  // Same outside-corner seat as the jobs badge (top -3px, right -4px): the
  // two 28px controls must read as twins. 0.1.6 docked this badge inside
  // because the trigger's own ellipsis overflow and the crumbs nav clipped
  // anything outside; on 0.1.7 the trigger lives in the title cluster with
  // no clipping ancestor, so the outside seat paints fine (verified live).
  assert.match(badge, /top: -3px !important;/)
  assert.match(badge, /right: -4px !important;/)
})

test('the lineage root keeps a gap from the title ellipsis', () => {
  // Measured live at 390px: the switcher's "…" ends exactly where the
  // trigger begins, merging into "…1". A fixed margin separates them; the
  // switcher absorbs it via flex.
  const gap = /\[class\*="_crumbs"\] \[class\*="_root"\]:not\(\[class\*="_switcherRoot"\]\):has\(> button\[class\*="_trigger"\]\) \{([^}]*)\}/.exec(layout)?.[1]
  assert.ok(gap, 'the lineage gap rule is missing from layout.css.ts')
  assert.match(gap, /margin-left: 6px !important;/)
})

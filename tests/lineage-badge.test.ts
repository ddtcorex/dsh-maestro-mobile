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

test('the reconciler marks only the crumbs lineage trigger', () => {
  // The lineage trigger is the only accordion in the header crumbs with
  // aria-haspopup="tree": the session switcher beside it carries no popup
  // attributes, and the plugin's own drawer toggle lives in the header
  // actions slot — so the marker lands on the lineage trigger and never on
  // either control.
  assert.match(effect, /\[data-slot="conversation\.session\.header"\]/)
  assert.match(effect, /\[class\*="_crumbs"\]/)
  assert.match(effect, /button\[class\*="_trigger"\]\[aria-haspopup="tree"\]/)
})

test('the compact control removes its markers so desktop stays a no-op', () => {
  assert.match(effect, /setAttribute\('data-mobile-nav', 'lineage'\)/)
  assert.match(effect, /setAttribute\(\s*'data-lineage-count',/)
  assert.match(effect, /removeAttribute\('data-mobile-nav'\)/)
  assert.match(effect, /removeAttribute\('data-lineage-count'\)/)
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
})

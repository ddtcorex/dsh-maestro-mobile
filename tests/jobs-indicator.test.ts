import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { jobsCountFromLabel } from '../src/client/effects/jobs-indicator.ts'

const layout = readFileSync(new URL('../src/client/styles/layout.css.ts', import.meta.url), 'utf8')
const effect = readFileSync(new URL('../src/client/effects/jobs-indicator.ts', import.meta.url), 'utf8')

test('the background-job badge count comes from the control accessible name', () => {
  // Upstream keeps the localized sentence ("N background jobs running") as the
  // trigger's aria-label, and the compact mobile control hides that text but
  // must still show the number. The label is the only place the count survives
  // once the sentence is hidden, and it is localized, so read the leading
  // integer rather than any surrounding word.
  assert.equal(jobsCountFromLabel('1 background job running'), 1)
  assert.equal(jobsCountFromLabel('5 background jobs'), 5)
  assert.equal(jobsCountFromLabel('12 background jobs running'), 12)
  assert.equal(jobsCountFromLabel('3 个后台任务运行中'), 3)
  assert.equal(jobsCountFromLabel('background jobs'), 0)
  assert.equal(jobsCountFromLabel(''), 0)
  assert.equal(jobsCountFromLabel(null), 0)
  assert.equal(jobsCountFromLabel(undefined), 0)
})

test('the reconciler marks only the session-header jobs control', () => {
  // The jobs root is the only aria-expanded accordion inside the session
  // header's actions slot, and the drawer toggle the plugin registers next to
  // it carries no aria-expanded — so the marker lands on the jobs trigger and
  // never on the plugin's own control.
  assert.match(effect, /\[data-slot="conversation\.session\.header\.actions"\]/)
  assert.match(effect, /button\[class\*="_trigger"\]\[aria-expanded\]/)
})

test('a live job keeps upstream’s animated state dot', () => {
  // The compact control's loading mark IS the dot upstream already draws for a
  // live job (an animated 3x3 matrix <svg> carrying the triggerDot class, with
  // the idle state rendered as a <span>): the selector must hide the chevron
  // without taking that animation with it.
  const hidden = /\[data-mobile-nav="jobs"\] \[class\*="_count"\],([\s\S]*?)\n  \}/.exec(layout)?.[1]
  assert.ok(hidden, 'the hidden-sentence rule is missing')
  assert.match(hidden, /\[data-mobile-nav="jobs"\] > svg:not\(\[class\*="_triggerDot"\]\) \{/)
  assert.doesNotMatch(hidden, /\[data-mobile-nav="jobs"\] > svg \{/)
  // No second loading affordance: the control stays static apart from the dot.
  assert.doesNotMatch(layout, /data-jobs-live/)
  assert.doesNotMatch(effect, /data-jobs-live/)
})

test('the compact control removes its markers so desktop stays a no-op', () => {
  assert.match(effect, /setAttribute\('data-mobile-nav', 'jobs'\)/)
  assert.match(effect, /setAttribute\(\s*'data-jobs-count',/)
  assert.match(effect, /removeAttribute\('data-mobile-nav'\)/)
  assert.match(effect, /removeAttribute\('data-jobs-count'\)/)
})

test('the jobs control collapses to a 28px icon button with a count badge', () => {
  // The upstream trigger pins its full sentence at max-content width: measured
  // 179x28px inside a 390px header, which crushed the session title (crumbs)
  // to 30px. The compact form is the same 28px circle as the drawer and
  // right-sidebar toggles, with the count as a badge.
  const trigger = /\[data-mobile-nav="jobs"\] \{([\s\S]*?)\n  \}/.exec(layout)?.[1]
  assert.ok(trigger, 'the compact jobs control rule is missing from layout.css.ts')
  assert.match(trigger, /width: 28px !important;/)
  assert.match(trigger, /height: 28px !important;/)
  assert.match(trigger, /border-radius: 999px !important;/)

  const hidden = /\[data-mobile-nav="jobs"\] \[class\*="_count"\]([\s\S]*?)\n  \}/.exec(layout)?.[1]
  assert.ok(hidden, 'the hidden-sentence rule is missing')
  assert.match(hidden, /display: none !important;/)
  assert.match(hidden, /\[data-mobile-nav="jobs"\] > svg/)

  const badge = /\[data-mobile-nav="jobs"\]::after \{([\s\S]*?)\n  \}/.exec(layout)?.[1]
  assert.ok(badge, 'the count badge rule is missing')
  assert.match(badge, /content: attr\(data-jobs-count\)/)
  assert.match(badge, /position: absolute !important;/)
})

test('the jobs panel docks under the session header instead of leaving the viewport', () => {
  // Upstream anchors the popover to the jobs root, but the header-crowding rule
  // sets that root to position: static, so the absolute panel resolved against
  // a distant containing block and rendered at y=849 — entirely below the
  // 844px viewport. A fixed panel is immune to that anchor and to the
  // overflow: hidden ancestors ([data-phase], .centerCol), and the safe-area
  // inset keeps it below the status bar on a notched phone.
  const panel = /\[class\*="_root"\]:has\(> \[data-mobile-nav="jobs"\]\) > ul\[class\*="_menu"\] \{([\s\S]*?)\n  \}/.exec(layout)?.[1]
  assert.ok(panel, 'the jobs panel rule is missing from layout.css.ts')
  assert.match(panel, /position: fixed !important;/)
  assert.match(panel, /top: calc\(76px \+ env\(safe-area-inset-top, 0px\)\) !important;/)
  assert.match(panel, /left: 8px !important;/)
  assert.match(panel, /right: 8px !important;/)
  assert.match(panel, /width: auto !important;/)
  assert.match(panel, /max-width: none !important;/)
  assert.match(panel, /max-height: min\(420px, calc\(100dvh - 92px - env\(safe-area-inset-top, 0px\)\)\) !important;/)
})

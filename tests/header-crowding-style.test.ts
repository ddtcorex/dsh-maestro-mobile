import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const layout = readFileSync(new URL('../src/client/styles/layout.css.ts', import.meta.url), 'utf8')

test('the redundant header More-actions menu stays hidden on mobile', () => {
  // The header "More actions" (⋯) menu resolves to a single entry on mobile —
  // "Download session log" — which already exists as the drawer-footer
  // Session log button (MobileDrawerFooter). Matched by class substring: the
  // hash changes per build and the aria-label ("More actions") changes per
  // locale.
  assert.match(
    layout,
    /\[data-mobile-nav="frame"\] \[data-phase\] \[data-slot="conversation\.session\.header"\] > header \[class\*="moreButton"\]\s*\{\s*display:\s*none\s*!important;\s*\}/s,
  )
})

test('the upstream right-sidebar toggle takes over the freed header slot', () => {
  // DSH ships the panel toggle in the header corner
  // (button[data-sidebar-right-expand], "Open right sidebar" ⟷ "Collapse right
  // sidebar") but hides the whole corner below its own breakpoint. Un-hide it
  // in the slot the ⋯ menu vacated, so the mobile header gains a right-hand
  // panel toggle that reuses upstream's own open/collapse state.
  const corner = /\[data-conversation-header-corner\] \{([\s\S]*?)\n  \}/.exec(layout)?.[1]
  assert.ok(corner, 'headerCorner rule is missing from layout.css.ts')
  assert.match(corner, /display: block !important;/)
  assert.match(corner, /right: 8px !important;/)
  // Upstream's `margin-right: -16px` is resolved against `right` for an
  // absolutely-positioned box, which would push the button off the viewport.
  assert.match(corner, /margin-inline: 0 !important;/)

  // It is absolutely positioned, so the title row must reserve its 28px plus
  // the 8px gutter or it lands on the workspace/chevron cluster.
  const titleRow = /\[class\*="_titleRow"\] \{([\s\S]*?)\n  \}/.exec(layout)?.[1]
  assert.ok(titleRow, 'titleRow reservation rule is missing')
  assert.match(titleRow, /padding-right: 36px !important;/)
})

test('the directory drawer toggle stays at the far left', () => {
  // The right-sidebar corner toggle must not displace the drawer opener: they
  // are two different panels and both stay reachable.
  const rule = /\/\* The directory toggle[\s\S]*?\*\/\s*\[data-mobile-nav="toggle"\] \{([\s\S]*?)\n  \}/.exec(layout)?.[1]
  assert.ok(rule, 'toggle rule is missing from layout.css.ts')
  assert.match(rule, /left: 8px !important;/)
  assert.doesNotMatch(rule, /right: 8px !important;/)
})

test('the empty upstream leading box collapses so the title cluster takes the row', () => {
  // 0.1.6 titleRow splits free space between headerLeading (an unfilled
  // leading slot in this deployment) and titleCluster: 113px of dead space
  // at 390px, starving the session title. Collapse it only while the slot
  // has no occupants, so a future upstream entry reappears without change.
  const leading = /\/\* Empty upstream leading box[\s\S]*?\*\/\s*(\[data-mobile-nav="frame"\] \[data-phase\] \[data-slot="conversation\.session\.header"\] > header \[class\*="_headerLeading"\][^{]*)\{([\s\S]*?)\n  \}/.exec(layout)
  assert.ok(leading, 'headerLeading collapse rule is missing from layout.css.ts')
  assert.match(leading[2], /display: none !important;/)
  assert.match(leading[1], /:not\(:has\(\[data-slot="conversation\.session\.header\.leading"\] > \*\)\)/, 'must only collapse while the leading slot is empty')
})

test('the subagent lineage yields to the session title on narrow phones', () => {
  // Measured live at 390px with one running subagent: the pinned
  // max-content lineage root took 81px and crushed the session switcher to
  // 16px (title invisible). On narrow phones the decorative "/" hides and
  // the trigger ellipsizes (count stays visible) while the switcher is
  // allowed to shrink, so the title keeps every remaining pixel.
  const sep = /\[class\*="_crumbs"\] \[class\*="_root"\]:not\(\[class\*="_switcherRoot"\]\):has\(> button\[class\*="_trigger"\]\) > \[class\*="_separator"\]\s*\{([^}]*)\}/.exec(layout)?.[1]
  assert.ok(sep, 'lineage separator rule is missing from layout.css.ts')
  assert.match(sep, /display: none !important;/)
  const trigger = /\[class\*="_crumbs"\] \[class\*="_root"\]:not\(\[class\*="_switcherRoot"\]\):has\(> button\[class\*="_trigger"\]\) > button\[class\*="_trigger"\]:not\(\[data-mobile-nav\]\)\s*\{([^}]*)\}/.exec(layout)?.[1]
  assert.ok(trigger, 'lineage trigger cap rule is missing from layout.css.ts')
  assert.match(trigger, /max-width: 56px !important;/)
  assert.match(trigger, /text-overflow: ellipsis !important;/)
  assert.match(trigger, /min-width: 0 !important;/)
  const switcher = /\[class\*="_crumbs"\] \[class\*="_crumbCurrent"\]\s*\{([^}]*)\}/.exec(layout)?.[1]
  assert.ok(switcher, 'switcher shrink rule is missing from layout.css.ts')
  assert.match(switcher, /min-width: 0 !important;/)
})

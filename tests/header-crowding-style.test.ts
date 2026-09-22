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

test('0.1.7 header row anchors on the titleRow div, not <header>', () => {
  // 0.1.7 removed the <header> element: seat children are div.titleRow
  // (first) and div.tabs (last). Pre-0.1.7 `> header` rules match nothing,
  // so the row box, cluster flex and ellipsis chain re-anchor here.
  const row = /\[data-slot="conversation\.session\.header"\] > div:first-child \{([\s\S]*?)\n  \}/.exec(layout)?.[1]
  assert.ok(row, '0.1.7 titleRow rule is missing from layout.css.ts')
  assert.match(row, /display: flex !important;/)
  assert.match(row, /padding-right: 36px;/)
  const chain = /\[class\*="_crumbs"\] \{([\s\S]*?)\n  \}/.exec(layout)?.[1]
  assert.ok(chain, '0.1.7 crumbs ellipsis rule is missing')
  assert.match(chain, /min-width: 0;/)
  assert.match(chain, /text-overflow: ellipsis;/)
})

test('0.1.7 unmarked lineage trigger stays one line until the effect marks it', () => {
  // The reconciler collapses the marked trigger to a 28px badge circle;
  // before the mark lands (or with effects off) the tall badge-over-caption
  // stack invaded the tab row at 390px. The fallback caps the unmarked
  // trigger to one 28px line and must not touch the marked state.
  const fallback = /button\[class\*="_trigger"\]\[aria-haspopup="tree"\]:not\(\[data-mobile-nav\]\) \{([\s\S]*?)\n  \}/.exec(layout)?.[1]
  assert.ok(fallback, 'unmarked trigger fallback rule is missing')
  assert.match(fallback, /flex-direction: row !important;/)
  assert.match(fallback, /max-height: 28px !important;/)
})

test('0.1.7 Files chevron hides on narrow phones, tabs scroll one line', () => {
  // The split-button chevron ("More ways to open") costs ~30px the title
  // needs at 390px; the primary Files action keeps its hit area.
  assert.match(
    layout,
    /\[class\*="headerUtilities"\] \[class\*="chevron"\]\s*\{\s*display:\s*none\s*!important;\s*\}/s,
  )
  // Tabs are direct seat children on 0.1.7 (div[class*="tabs"]), not nested
  // in the header: same one-line horizontal scroll contract as before.
  const tabs = /> div\[class\*="tabs"\] \{([\s\S]*?)\n  \}/.exec(layout)?.[1]
  assert.ok(tabs, '0.1.7 direct-tabs rule is missing')
  assert.match(tabs, /overflow-x: auto !important;/)
  assert.match(tabs, /white-space: nowrap !important;/)
})

test('0.1.7 header controls share one vertical center line', () => {
  // Measured live at 390px: in-flow 28px controls sit at y=11 while the
  // absolutely-positioned toggle/corner used a fixed top:12px (1px low),
  // and the Files button is 22px tall. The row is the positioning context
  // and both absolute controls center against it, so every control's
  // center lands on the same line whatever the row offset is.
  const row = /\[data-slot="conversation\.session\.header"\] > div:first-child \{([\s\S]*?)\n  \}/.exec(layout)?.[1]
  assert.ok(row, '0.1.7 titleRow rule is missing')
  assert.match(row, /position: relative !important;/)
  assert.match(
    layout,
    /\[data-slot="conversation\.session\.header"\][^{]*\[data-mobile-nav="toggle"\]\s*\{[^}]*top: 50% !important;[^}]*transform: translateY\(-50%\) !important;/s,
    'toggle must center against the row, not a fixed top',
  )
  assert.match(
    layout,
    /\[data-slot="conversation\.session\.header"\][^{]*\[data-conversation-header-corner\]\s*\{[^}]*top: 50% !important;[^}]*transform: translateY\(-50%\) !important;/s,
    'corner must center against the row, not a fixed top',
  )
  assert.match(
    layout,
    /\[class\*="headerUtilities"\] button:not\(\[class\*="moreButton"\]\):not\(\[class\*="chevron"\]\)\s*\{[^}]*height: 28px !important;/s,
    'utilities buttons must match the 28px control rhythm without re-showing the hidden menu/chevron',
  )
})

test('0.1.7 trailing actions form one tight right group', () => {
  // Measured live at 390px: free space scattered as a 43px hole between the
  // subagents trigger and Files plus 31px between Files and the corner,
  // against 8px elsewhere. The title cluster is shrink-only (flex 0 1 auto)
  // so it never donates space right; the utilities cluster carries
  // margin-left auto and docks flush against the corner reservation, leaving
  // exactly one flexible gap mid-row and an 8px rhythm everywhere else.
  const cluster = /\[data-slot="conversation\.session\.header"\] > div:first-child > :first-child \{([\s\S]*?)\n  \}/.exec(layout)?.[1]
  assert.ok(cluster, '0.1.7 titleCluster rule is missing')
  assert.match(cluster, /flex: 0 1 auto !important;/)
  const row = /\[data-slot="conversation\.session\.header"\] > div:first-child \{([\s\S]*?)\n  \}/.exec(layout)?.[1]
  assert.ok(row, '0.1.7 titleRow rule is missing')
  assert.match(row, /gap: 8px;/)
  assert.match(
    layout,
    /\[class\*="headerUtilities"\] \{[^}]*margin-left: auto !important;/s,
    'utilities must dock right via auto margin',
  )
})

test('0.1.7 Files glyph is optically centered in its button', () => {
  // Geometry lies here: the arrow path is centered in its viewBox and the
  // svg box is centered in the button, yet the ink masses toward the
  // arrowhead (top-right) and reads low-left at phone sizes (zoomed CDP
  // shots, 2026-09-22). A 2px down-left nudge on the svg balances the
  // visual mass. Scoped to utilities buttons so no other glyph moves.
  assert.match(
    layout,
    /\[class\*="headerUtilities"\] button:not\(\[class\*="moreButton"\]\):not\(\[class\*="chevron"\]\) > svg\s*\{[^}]*transform: translate\(1px, -2px\) !important;/s,
  )
})

test('0.1.7 side toggles read as a matched pair', () => {
  // Measured live at 390px: both 28px boxes are centered, but the left
  // (drawer) glyph renders 16px while upstream's right (panel) glyph is
  // 15px — the pair reads unbalanced. Normalize the right svg to 16px;
  // vector art scales cleanly and the button box is untouched.
  assert.match(
    layout,
    /\[data-conversation-header-corner\] button svg\s*\{[^}]*width: 16px !important;[^}]*height: 16px !important;/s,
  )
})

test('0.1.7 title row sits symmetric in the viewport', () => {
  // Measured live at 390px: the row itself offsets 20px left / 28px right,
  // so with symmetric 8px control insets the content gutters read 28 left
  // vs 36 right. A 4px row shift balances both gutters at 32px.
  const row = /\[data-slot="conversation\.session\.header"\] > div:first-child \{([\s\S]*?)\n  \}/.exec(layout)?.[1]
  assert.ok(row, '0.1.7 titleRow rule is missing')
  assert.match(row, /margin-left: 4px/)
})

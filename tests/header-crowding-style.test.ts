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
    /\[data-mobile-nav="frame"\] \[data-phase\] header \[class\*="moreButton"\]\s*\{\s*display:\s*none\s*!important;\s*\}/s,
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

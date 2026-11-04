import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const layout = readFileSync(new URL('../src/client/styles/layout.css.ts', import.meta.url), 'utf8')

// DSH 0.2.2-alpha.3 moved the host's own sidebar opener into the drawer corner
// (`.frame[data-sidebar-drawer] .leadingSeat { top: 11px; left: 12px }`, alpha.2
// kept left: 88px). The leading seat is a frame child painted after the center
// column, so it covers this plugin's toggle at x=16 and every tap opens the
// drawer through the host's button instead: two openers, one reachable.
// The plugin keeps its toggle only for hosts that mount no leading-seat
// opener, which is the case the :has() guard below carves out.

test('the plugin toggle is hidden while the host mounts its own opener', () => {
  assert.match(
    layout,
    /\[data-mobile-nav="frame"\]:has\(\[data-slot="shell\.leading"\] button\[data-sidebar-opener\]\)\s*\[data-mobile-nav="toggle"\]\s*\{[^}]*display:\s*none\s*!important;/s,
  )
})

test('the hide rule is scoped to the leading seat, not any opener on the page', () => {
  const rule = layout.match(
    /\[data-mobile-nav="frame"\]:has\(([^)]*(?:\([^)]*\))?[^)]*)\)\s*\[data-mobile-nav="toggle"\]/s,
  )
  assert.notEqual(rule, null, 'the frame :has() guard is missing')
  assert.match(rule[1], /\[data-slot="shell\.leading"\]/, 'guard must name the leading seat')
  assert.match(rule[1], /button\[data-sidebar-opener\]/, 'guard must name the host opener button')
})

test('the toggle itself keeps its phone geometry for hosts without an opener', () => {
  assert.match(
    layout,
    /\[data-mobile-nav="toggle"\]\s*\{[^}]*position:\s*absolute\s*!important;[^}]*left:\s*8px\s*!important;/s,
  )
})

// DSH 0.2.2-alpha.3 also prepends a drawerMask element to the frame, so the
// drawer column stopped being the frame's first child. Every drawer rule must
// name the host's sidebar column directly; "> :first-child" would restyle the
// mask (measured 2026-11-04: mask 0x844 at z-index 150 with the drawer's
// background, sidebar column left to the host's own -100% translate).
test('the drawer column is addressed by its own class, not by frame position', () => {
  assert.match(
    layout,
    /\[data-mobile-nav="frame"\]\s*>\s*\[class\*="_sidebarCol"\]\s*\{[^}]*position:\s*absolute\s*!important;/s,
  )
  assert.doesNotMatch(
    layout,
    /\[data-mobile-nav="frame"\](?::not\(\[data-sidebar-collapsed\]\))?\s*>\s*:first-child\s*\{/s,
    'a frame-level rule still targets :first-child',
  )
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const layout = readFileSync(new URL('../src/client/styles/layout.css.ts', import.meta.url), 'utf8')

// DSH 0.2.2-alpha.3 pinned the shell columns to explicit tracks in the host's
// own layout sheet (`sidebarCol` grid-area 1/1, `centerCol` 1/2, `rightbarCol`
// 1/3), which retires the auto-placement the frame override relied on. The
// frame template keeps track 1 at `minmax(0, 1fr)` and tracks 2..3 at 0, so a
// pinned center column lands in a zero-width track and the whole conversation
// collapses off-screen (measured 2026-11-04 on 0.2.2-alpha.3: centerCol
// 0x844 @390, blank phone screen). Placing the center back in track 1 is the
// fix; on a host that still auto-places it resolves to the same track.

test('the frame override still gives the center column the drawer’s track', () => {
  assert.match(
    layout,
    /\[data-mobile-nav="frame"\]\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+0\s+0\s*!important;/s,
  )
})

test('the center column is pinned to the wide track, not left to host placement', () => {
  assert.match(
    layout,
    /\[data-mobile-nav="frame"\]\s*>\s*\[class\*="_centerCol"\]\s*\{[^}]*grid-column:\s*1\s*!important;/s,
  )
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fabMode } from '../src/client/effects/panel-presence.ts'

const overlay = readFileSync(new URL('../src/client/components/ShellOverlay.tsx', import.meta.url), 'utf8')

/**
 * A global panel page (Plugins, ...) replaces the conversation, so it carries no
 * [data-phase] element. heroPhase was defined as "no active phase", which a
 * panel satisfies — the FAB therefore mounted on top of the panel's own content
 * (38x38 at 10,72, z-index 21, pointer-events auto), swallowing taps as well as
 * covering the subtitle.
 *
 * Since the panel exit work (panel-exit.ts) the button is not hidden there but
 * REPURPOSED: same corner, same size, "back to conversation" semantics, moved to
 * the top-left by data-mobile-nav-fab-mode="exit-panel" (base.css.ts). Hiding it
 * was the interim fix; meaning is the better one, because a panel page renders
 * no session header and therefore no drawer toggle either.
 */
test('a panel turns the FAB into the way back to the conversation', () => {
  assert.equal(fabMode({ drawerOpen: false, panelOpen: true }), 'exit-panel')
  })

test('the FAB is gone on the genuine hero screen', () => {
  // The hero face duplicated the host's own drawer opener (the rail button in
  // the shell corner, visible on every phone width) and the owner called it
  // redundant on the start screen: two controls, one action, and the FAB
  // floating over the hero content below the opener. The host opener is the
  // only entry now; the FAB keeps the panel-page face only (owner report
  // 2026-11-06).
  assert.equal(fabMode({ drawerOpen: false, panelOpen: false }), 'hidden')
})

test('the FAB is hidden while the drawer itself is open', () => {
  assert.equal(fabMode({ drawerOpen: true, panelOpen: false }), 'hidden')
  assert.equal(fabMode({ drawerOpen: true, panelOpen: true }), 'hidden')
})

test('no FAB on a normal conversation phase, panel or not', () => {
  assert.equal(fabMode({ drawerOpen: false, panelOpen: false }), 'hidden')
})

test('the overlay consults the panel predicate, not absence alone', () => {
  assert.match(overlay, /from '\.\.\/effects\/panel-presence\.ts'/)
  assert.match(overlay, /isPanelOpen\(\)/)
  assert.match(overlay, /fabMode\(/)
})

test('the overlay keeps the backdrop toggle and routes the FAB to exit only', () => {
  // The backdrop click-to-close drawer still routes through toggleSidebar.
  assert.match(overlay, /toggleSidebar\(\)/)
  assert.match(overlay, /data-mobile-nav-fab-mode=\{mode\}/)
  assert.match(overlay, /backToConversation/)
  // The hero face is gone: no second drawer opener next to the host's own one.
  assert.doesNotMatch(overlay, /'open'/)
})

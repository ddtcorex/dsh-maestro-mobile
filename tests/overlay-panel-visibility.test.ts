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
  assert.equal(fabMode({ heroPhase: true, drawerOpen: false, panelOpen: true }), 'exit-panel')
  // The panel wins even when a conversation phase is somehow still present.
  assert.equal(fabMode({ heroPhase: false, drawerOpen: false, panelOpen: true }), 'exit-panel')
})

test('the FAB still opens the drawer on the genuine hero screen', () => {
  assert.equal(fabMode({ heroPhase: true, drawerOpen: false, panelOpen: false }), 'open-drawer')
})

test('the FAB is hidden while the drawer itself is open', () => {
  assert.equal(fabMode({ heroPhase: true, drawerOpen: true, panelOpen: false }), 'hidden')
  assert.equal(fabMode({ heroPhase: true, drawerOpen: true, panelOpen: true }), 'hidden')
})

test('no FAB on a normal conversation phase, panel or not', () => {
  assert.equal(fabMode({ heroPhase: false, drawerOpen: false, panelOpen: false }), 'hidden')
})

test('the overlay consults the panel predicate, not heroPhase alone', () => {
  assert.match(overlay, /from '\.\.\/effects\/panel-presence\.ts'/)
  assert.match(overlay, /fabMode\(/)
})

test('the overlay routes the two faces to the two actions and labels them', () => {
  assert.match(overlay, /exitPanel\(\)/)
  assert.match(overlay, /toggleSidebar\(\)/)
  assert.match(overlay, /data-mobile-nav-fab-mode=\{mode\}/)
  assert.match(overlay, /backToConversation/)
})

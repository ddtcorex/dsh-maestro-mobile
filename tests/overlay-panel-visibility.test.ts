import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { shouldShowFab } from '../src/client/effects/panel-presence.ts'

const overlay = readFileSync(new URL('../src/client/components/ShellOverlay.tsx', import.meta.url), 'utf8')

/**
 * A global panel page (Plugins, …) replaces the conversation, so it carries no
 * [data-phase] element. heroPhase was defined as "no active phase", which a
 * panel satisfies — the FAB therefore mounted on top of the panel's own
 * content (38x38 at 10,72, z-index 21, pointer-events auto), swallowing taps as
 * well as covering the subtitle.
 */
test('the drawer FAB is hidden while a global panel is open', () => {
  assert.equal(shouldShowFab({ heroPhase: true, drawerOpen: false, panelOpen: true }), false)
})

test('the FAB still shows on the genuine hero screen', () => {
  assert.equal(shouldShowFab({ heroPhase: true, drawerOpen: false, panelOpen: false }), true)
})

test('the FAB stays hidden while the drawer itself is open', () => {
  assert.equal(shouldShowFab({ heroPhase: true, drawerOpen: true, panelOpen: false }), false)
})

test('no FAB on a normal conversation phase, panel or not', () => {
  assert.equal(shouldShowFab({ heroPhase: false, drawerOpen: false, panelOpen: false }), false)
  assert.equal(shouldShowFab({ heroPhase: false, drawerOpen: false, panelOpen: true }), false)
})

test('the overlay consults the panel predicate, not heroPhase alone', () => {
  assert.match(overlay, /from '\.\.\/effects\/panel-presence\.ts'/)
  assert.match(overlay, /shouldShowFab\(/)
})

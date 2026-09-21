import assert from 'node:assert/strict'
import test from 'node:test'
import { DRAWER_NAV_TAP_SELECTOR, matchesDrawerNavTap } from '../src/client/effects/drawer-navigation.ts'

/**
 * A sidebar panel row (Plugins, Skills, …) swaps the main column but the
 * mobile drawer stays open over the content it just opened. The drawer
 * whitelist must carry the panel-row fragments so the tap collapses it like
 * every other navigation target.
 */
test('a sidebar panel row is a drawer-collapsing navigation target', () => {
  assert.equal(matchesDrawerNavTap('panelRow'), true)
})

test('every previously supported navigation target still matches', () => {
  for (const fragment of [
    'newSession',
    'sessionRow',
    'searchResultRow',
    'searchResultWorkspace',
  ]) {
    assert.equal(matchesDrawerNavTap(fragment), true, `${fragment} regressed`)
  }
})

test('non-navigation targets inside the drawer do not collapse it', () => {
  for (const fragment of ['panelGlyph', 'panelTitle', 'connector', 'usageBadge']) {
    assert.equal(matchesDrawerNavTap(fragment), false, `${fragment} wrongly matched`)
  }
})

test('the exported selector carries the panel-row fragment', () => {
  assert.match(DRAWER_NAV_TAP_SELECTOR, /panelRow/)
})

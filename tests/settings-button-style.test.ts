import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const layout = readFileSync(new URL('../src/client/styles/layout.css.ts', import.meta.url), 'utf8')

test('the drawer settings control fills its mobile gutter and centers its label', () => {
  assert.match(
    layout,
    /\[data-mobile-nav="frame"\] \[class\*="_settingsArea"\]\s*\{[^}]*padding-inline:\s*0\s*!important;[^}]*width:\s*100%\s*!important;[^}]*box-sizing:\s*border-box\s*!important;/s,
  )
  // The trigger rule carries two guards: data-phase ownership (the
  // ConnectionIndicator chip beside Settings carries data-phase=connecting|
  // disconnected|recovered and must keep its own palette, not this stretch)
  // and a modal-subtree guard, without which the width force also hit buttons
  // inside portaled aria-modal sheets that share the drawer DOM subtree (same
  // collision class as the dshmarket cats-row overlap).
  assert.match(
    layout,
    /\[data-mobile-nav="frame"\] \[class\*="_settingsArea"\] button:not\(\[data-phase\]\):not\(\[aria-modal="true"\] \*\)\s*\{[^}]*width:\s*100%\s*!important;[^}]*justify-content:\s*flex-start\s*!important;[^}]*margin-inline:\s*0\s*!important;[^}]*padding-inline:\s*14px\s*!important;[^}]*height:\s*42px\s*!important;[^}]*min-height:\s*42px\s*!important;/s,
  )
})

// The ConnectionIndicator chip (Connecting… / Disconnected / Connected) sits in
// the same triggerRow as the Settings button, carrying data-phase on its own
// button. It must be lifted to the TOP of the Bento foot card (above the
// Files/Session log pills and above the Settings trigger): the wrappers are
// dissolved with display:contents so chip + pills + trigger become sibling
// flex items of the foot column, then chip orders first (-1) and trigger last
// (1). Doing nothing leaves the inline row (~300px drawer) overflowing —
// pre-fix the width:100% !important force hit the chip (flex:none) so the row
// scrolled 402px vs 238px and the Settings trigger crushed to 30px.
test('the ConnectionIndicator is lifted to the top of the foot card instead of overflowing the trigger row', () => {
  assert.match(
    layout,
    /\[data-mobile-nav="frame"\] \[class\*="_footArea"\]:has\(\[class\*="_triggerRow"\] > button\[data-phase\]\)\s*\{\s*gap:\s*8px\s*!important;\s*\}/s,
  )
  assert.match(
    layout,
    /\[data-mobile-nav="frame"\] \[class\*="_footArea"\]:has\(\[class\*="_triggerRow"\] > button\[data-phase\]\) \[class\*="_settingsArea"\],\s*\[data-mobile-nav="frame"\] \[class\*="_footArea"\]:has\(\[class\*="_triggerRow"\] > button\[data-phase\]\) \[class\*="_triggerRow"\]\s*\{\s*display:\s*contents\s*!important;\s*\}/s,
  )
  assert.match(
    layout,
    /\[data-mobile-nav="frame"\] \[class\*="_footArea"\]:has\(\[class\*="_triggerRow"\] > button\[data-phase\]\) \[class\*="_settingsArea"\] button\[data-phase\]\s*\{[^}]*order:\s*-1\s*!important;[^}]*flex:\s*0\s*0\s*auto\s*!important;[^}]*width:\s*100%\s*!important;[^}]*height:\s*36px\s*!important;[^}]*min-height:\s*36px\s*!important;[^}]*justify-content:\s*flex-start\s*!important;[^}]*border-radius:\s*10px\s*!important;/s,
  )
  assert.match(
    layout,
    /\[data-mobile-nav="frame"\] \[class\*="_footArea"\]:has\(\[class\*="_triggerRow"\] > button\[data-phase\]\) \[class\*="_settingsArea"\] button:not\(\[data-phase\]\)\s*\{\s*order:\s*1\s*!important;\s*flex:\s*0\s*0\s*auto\s*!important;\s*\}/s,
  )
  // Belt and braces: no leftover rule stretches every settings-area button
  // (the pre-fix leak that also hit the chip).
  assert.doesNotMatch(
    layout,
    /\[class\*="_settingsArea"\] button:not\(\[aria-modal="true"\] \*\)\s*\{[^}]*width:\s*100%\s*!important/s,
  )
})
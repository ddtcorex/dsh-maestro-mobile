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
// button. The row must stack — Settings keeps its full-width primary row, the
// chip becomes its own full-width strip below — instead of overflowing the
// ~300px drawer (pre-fix the width:100% !important force hit the chip, which
// is flex:none, so the row scrolled 402px vs 238px and the trigger crushed to
// 30px).
test('the ConnectionIndicator next to Settings stacks below the trigger instead of overflowing the row', () => {
  assert.match(
    layout,
    /\[data-mobile-nav="frame"\] \[class\*="_settingsArea"\] \[class\*="_triggerRow"\]:has\(> button\[data-phase\]\)\s*\{[^}]*flex-direction:\s*column\s*!important;[^}]*align-items:\s*stretch\s*!important;[^}]*gap:\s*6px\s*!important;[^}]*width:\s*100%\s*!important;[^}]*margin:\s*2px\s*0\s*0\s*!important;/s,
  )
  assert.match(
    layout,
    /\[data-mobile-nav="frame"\] \[class\*="_settingsArea"\] button\[data-phase\]\s*\{[^}]*width:\s*100%\s*!important;[^}]*height:\s*36px\s*!important;[^}]*min-height:\s*36px\s*!important;[^}]*justify-content:\s*flex-start\s*!important;[^}]*border-radius:\s*10px\s*!important;/s,
  )
  // Belt and braces: no leftover rule stretches every settings-area button
  // (the pre-fix leak that also hit the chip).
  assert.doesNotMatch(
    layout,
    /\[class\*="_settingsArea"\] button:not\(\[aria-modal="true"\] \*\)\s*\{[^}]*width:\s*100%\s*!important/s,
  )
})
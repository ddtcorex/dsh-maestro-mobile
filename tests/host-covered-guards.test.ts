import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const root = (path) => new URL(`../${path}`, import.meta.url)
const read = (path) => readFileSync(root(path), 'utf8')

const index = read('src/client/index.tsx')
const misc = read('src/client/styles/misc.css.ts')

// DSH 0.2.3-alpha.2 closes three phone defects this plugin used to compensate
// for, so all three compensations are gone. What made the host the owner:
//
//   1. hero preset menu: the host places a body-portalled menu with CSS anchor
//      positioning (`top: max(var(--dsh-menu-window-top), calc(anchor(bottom) + 4px))`)
//      plus `position-try-fallbacks`, and caps it at
//      `calc(100dvh - 12px - max(12px, var(--dsh-frame-overlay-top, 12px)))`, so
//      the inverted internal clamp the effect corrected cannot happen;
//   2. model menu search focus and 3. session-switch focus: the host skips every
//      state-driven focus on `isMobileDevice()`, a UA test that is true on every
//      phone and tablet this plugin runs on.
//
// A host hook replaces the safe-area half that both menu compensations carried:
// the host reads `--dsh-frame-overlay-top` for its menu and modal top inset and
// never writes it, so the plugin publishes it once from the root.
//
// These files, not the effect modules, are the contract: a guard comes back only
// together with a host reading that says the defect returned.

test('the guards the host now covers stay deleted', () => {
  for (const path of [
    'src/client/effects/preset-menu-fix.ts',
    'src/client/effects/model-menu-keyboard-guard.ts',
    'src/client/effects/session-focus-guard.ts',
  ]) {
    assert.equal(
      existsSync(root(path)),
      false,
      `${path} must stay deleted: the host owns this behavior now`,
    )
  }
})

test('the client installs none of them', () => {
  for (const installer of [
    'installHeroPresetMenuFix',
    'installModelMenuKeyboardGuard',
    'installSessionFocusGuard',
  ]) {
    assert.equal(index.includes(installer), false, `${installer} must leave the effect registry`)
  }
})

test('no menu height or position override is left for the host to fight', () => {
  // A bare portal-menu height cap is the one rule that loses to the host's own
  // clamp on specificity and then competes with `position-try` when it wins.
  assert.doesNotMatch(
    misc,
    /body > div\[role="menu"\]\s*\{[^}]*max-height/,
    'the host caps a portal menu to the dynamic viewport itself',
  )
})

test('the notch reaches the host through its own hook', () => {
  assert.match(
    misc,
    /:root\s*\{[^}]*--dsh-frame-overlay-top:\s*env\(safe-area-inset-top, 0px\)/s,
    'the host reads --dsh-frame-overlay-top and never writes it, so the plugin publishes it',
  )
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

/**
 * Stacking order inside AppFrame's overlay layer (`[data-shell-overlay]`, the
 * element that already carries `z-index: 20`).
 *
 * The plugin's backdrop used to sit at `z-index: 30`, above every sibling that
 * does not set a z-index of its own. On 0.2.2-alpha.2 the `shell.overlay` slot
 * has sixteen occupants: the plugin's backdrop and FAB, but also toasts and
 * dialogs registered by other packages (session-log upload, permission
 * outcomes, host release change, account platform page). A full-inset backdrop
 * at 30 painted over any of those that render without a z-index, so a toast
 * raised while the drawer was open was unreachable (measured: the layer holds
 * one `[data-slot="shell.overlay"]` wrapper and the backdrop is one of its
 * children, so DOM order decides among z-index:auto siblings).
 *
 * The contract: the backdrop stays above the page content (it lives inside the
 * z-20 layer, so it keeps that), stays BELOW the drawer (z 150), and must not
 * outrank sibling occupants that only rely on DOM order.
 */

const base = readFileSync(new URL('../src/client/styles/base.css.ts', import.meta.url), 'utf8')
const layout = readFileSync(new URL('../src/client/styles/layout.css.ts', import.meta.url), 'utf8')

/** Body of the first rule matching `selector`. */
function ruleBody(css: string, selector: RegExp): string | undefined {
  return selector.exec(css)?.[1]
}

test('the backdrop does not outrank sibling overlay occupants', () => {
  const backdrop = ruleBody(base, /\[data-mobile-nav="backdrop"\]\s*\{([^}]*)\}/) ?? ''
  assert.match(backdrop, /position: absolute/, 'the backdrop must stay positioned inside the overlay layer')
  const zIndex = /z-index:\s*(\d+)/.exec(backdrop)?.[1]
  assert.ok(
    zIndex === undefined || Number(zIndex) === 0,
    `the backdrop must not set a positive z-index (found ${zIndex ?? 'none'}): it would cover toasts and dialogs registered after it`,
  )
})

test('the backdrop still sits below the drawer', () => {
  // The drawer is the frame's first child, raised to 150 by layout.css.ts; the
  // backdrop lives in the z-20 overlay layer, so it stays underneath it.
  assert.match(layout, /\[data-mobile-nav="frame"\][^{]*> :first-child\s*\{[^}]*z-index:\s*150 !important/, 'drawer must stay at z 150')
  const layerZ = /\[data-shell-overlay\][^{]*\{[^}]*z-index:\s*(\d+)/.exec(layout)?.[1]
  assert.ok(
    layerZ === undefined || Number(layerZ) < 150,
    'the overlay layer must stay below the drawer',
  )
})

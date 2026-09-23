import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const chip = readFileSync(new URL('../src/client/effects/subagent-chip-touch.ts', import.meta.url), 'utf8')

test('the synthetic-hover swallow is scoped by our marker and the catalog role', () => {
  // The chip's box carries the lineage reconciler's own `data-lineage-root`; the
  // open catalog is named by the `role="tree"` list upstream draws
  // unconditionally, under the `_menu` popover fragment so only the subagent
  // catalog matches. Never by a CSS-module hash: `ZKlsPq`/`h8S2Va` named the box
  // on 0.1.0-rc.6 and matched nothing after the package was rebuilt, which
  // silently killed the swallow (measured live on 0.1.7: 31 in-scope hover events
  // over three taps still reached every later document listener, one of them
  // targeting the chip itself).
  assert.match(
    chip,
    /const HOVER_SUBTREE_SELECTOR = '\[data-lineage-root\], \[class\*="_menu"\]:has\(> \[role="tree"\]\)'/,
  )
  assert.doesNotMatch(chip, /class\*=\s*["'][A-Za-z0-9_-]{6}_/)
})

test('the swallow keeps its guards', () => {
  // Only events the browser synthesized from real input are swallowed, the
  // swallow stays inside the chip scope, and it must be the listener that stops
  // the event — a late listener seeing one is exactly the failure the scope fix
  // addresses.
  assert.match(chip, /if \(!event\.isTrusted\) return/)
  assert.match(chip, /if \(target\.closest\(HOVER_SUBTREE_SELECTOR\) === null\) return/)
  assert.match(chip, /event\.stopImmediatePropagation\(\)/)
  // Both hover directions are covered; a partial list leaves one timer live.
  assert.match(chip, /const SWALLOWED_TYPES = \['mouseover', 'mouseout', 'mouseenter', 'mouseleave'\] as const/)
})

test('the tap toggle stays scoped to the count trigger and its follow-up click', () => {
  // The switcher variant owns its own onClick, so the shim must not drive it;
  // the follow-up click of a tap we already handled must not reach the native
  // onClick (the flash-and-close race), while every other click passes through.
  assert.match(chip, /:not\(\[class\*="_switcherTrigger"\]\)/)
  assert.match(chip, /key: open \? 'Escape' : 'ArrowDown'/)
  assert.match(chip, /target\.closest<HTMLElement>\(CHIP_TRIGGER_SELECTOR\) !== toggledTrigger/)
  assert.match(chip, /event\.stopPropagation\(\)/)
})

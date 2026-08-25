import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const compat = readFileSync(new URL('../src/client/styles/compat.css.ts', import.meta.url), 'utf8')

test('plugin-config cards keep their natural chevron size (no legacy 40px force)', () => {
  // Commit 62b6827 shaped an OLDER upstream DOM whose chevron sat inside a
  // bordered wrapper box. Upstream now renders a bare 14px svg
  // (IconChevronDownOutline14) inside a header that is already
  // flex/gap-12/headText-flex-1, and the rule's
  // `> *:not([class*="headText"])` branch catches that raw SVG — inflating it
  // to a 40x40 inline-flex box (a ~3x stretched glyph) and clipping any
  // future direct child such as the unsaved-edits badge. Upstream
  // PluginCard.module.css covers the compact layout natively; the override
  // must not come back.
  assert.doesNotMatch(compat, /v1ASoG/)
})

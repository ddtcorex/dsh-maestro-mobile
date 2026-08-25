import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const layout = readFileSync(new URL('../src/client/styles/layout.css.ts', import.meta.url), 'utf8')

test('the round close-button base only styles real buttons, not bare svgs', () => {
  // The dsh-web-ui settings-sheet polish gives the reparented close control a
  // round tappable base via `[class*="_header"] ... > :last-child`. Upstream
  // PluginConfig cards also have a `_header` whose last child is a BARE
  // chevron <svg> (headText + svg): the unguarded :last-child branch turned
  // that glyph into a grey 32x32 circle on every plugins-settings card.
  // The branch must target interactive controls only.
  assert.match(
    layout,
    /\[class\*="_header"\]:not\(\[class\*="_headerActions"\]\) > :last-child:is\(button, \[role="button"\], a\)\s*\{/,
  )
  assert.doesNotMatch(
    layout,
    /\[class\*="_header"\]:not\(\[class\*="_headerActions"\]\) > :last-child\s*\{/,
  )
})

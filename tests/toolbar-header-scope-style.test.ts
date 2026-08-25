import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const layout = readFileSync(new URL('../src/client/styles/layout.css.ts', import.meta.url), 'utf8')

test('every web-ui toolbar-header rule requires a trailing interactive control', () => {
  // The dsh-web-ui settings-sheet polish compacts the toolbar header
  // (config-file action + close) via [class*="_header"]:not([class*=
  // "_headerActions"]) rules. Class hashes are case-sensitive, so the DSH-core
  // plugin-config card header (v1ASoG_header, lowercase h) matched too and
  // lost its native 14px 16px padding / inherited flex-end + gap 8, while the
  // visually identical dshmarket setHeader (_setHeader, capital H) kept them.
  // All such selectors must be anchored to headers whose LAST CHILD is an
  // interactive control (card headers end in a bare svg).
  const frags = layout.match(/\[class\*="_header"\]:not\(\[class\*="_headerActions"\]\)[^{]*\{/g) || []
  assert.equal(frags.length, 3, 'expected exactly three toolbar-header selectors')
  for (const frag of frags) {
    assert.match(frag, /:last-child:is\(button, \[role="button"\], a\)/, 'unguarded selector: ' + frag)
  }
})

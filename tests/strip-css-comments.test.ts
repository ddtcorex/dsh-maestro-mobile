import assert from 'node:assert/strict'
import test from 'node:test'
import { stripCssComments, stripEmittedCssModule } from '../scripts/strip-css-comments.mjs'

const emitted = (css) => `"use strict";\nObject.defineProperty(exports, "__esModule", { value: true });\nexports.LAYOUT_CSS = \`${css}\`;\n`

test('comments are dropped and the rule list is unchanged', () => {
  const css = '/* design record */\n.a {\n  color: red; /* inline */\n}\n\n/* second */\n.b { color: blue; }\n'
  assert.equal(stripCssComments(css), '.a {\n  color: red;\n}\n.b { color: blue; }')
  assert.doesNotMatch(stripCssComments(css), /\/\*/)
})

test('the emitted module keeps its export and loses only the comments', () => {
  const out = stripEmittedCssModule(emitted('/* why */\n.x { top: 0; }\n'))
  assert.match(out, /exports\.LAYOUT_CSS = `\.x \{ top: 0; \}`;/)
  assert.doesNotMatch(out, /why/)
})

test('a module that interpolates is refused rather than truncated', () => {
  assert.throws(
    () => stripEmittedCssModule(emitted('.x { top: ${value}; }')),
    /refusing to strip/,
  )
})

test('every styles module strips without changing its rule count', async () => {
  const { readFile } = await import('node:fs/promises')
  const names = ['base', 'composer', 'explorer-sheet', 'layout', 'misc', 'settings-sheet', 'tokens']
  for (const name of names) {
    const source = await readFile(new URL(`../.client-build/styles/${name}.css.js`, import.meta.url), 'utf8').catch(() => null)
    // The emit dir only exists mid-build; the source-level check below still runs.
    if (source === null) continue
    const stripped = stripEmittedCssModule(source)
    const selectorCount = (text) => (text.match(/\{/g) ?? []).length
    assert.equal(selectorCount(stripped), selectorCount(source), `${name}: rule count changed`)
    assert.doesNotMatch(stripped, /\/\*/, `${name}: comment survived`)
  }
})

test('no stylesheet source hides a comment opener inside a string or url()', async () => {
  const { readFile } = await import('node:fs/promises')
  const names = ['base', 'composer', 'explorer-sheet', 'layout', 'misc', 'settings-sheet', 'tokens']
  for (const name of names) {
    const source = await readFile(new URL(`../src/client/styles/${name}.css.ts`, import.meta.url), 'utf8')
    // The stripper is regex-based: a `/*` inside a string literal would be eaten
    // mid-rule. Pin that the stylesheets never contain one.
    assert.doesNotMatch(source, /["'][^"'\n]*\/\*/, `${name}.css.ts carries a comment opener inside a string`)
  }
})

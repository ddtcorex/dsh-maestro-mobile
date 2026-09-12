import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const root = new URL('../src/client/', import.meta.url)
const read = (path: string): string => readFileSync(new URL(path, root), 'utf8')

const STYLE_FILES = [
  'composer.css.ts',
  'explorer-sheet.css.ts',
  'layout.css.ts',
  'misc.css.ts',
  'settings-sheet.css.ts',
  'sheet.css.ts',
]

test('every narrow-width media query also requires a coarse pointer', () => {
  // Width alone cannot tell a phone from a desktop window: split views and OS
  // display scaling push a PC's CSS viewport below 1024px too, and the whole
  // mobile shell (drawer, header toggle, gestures) would mount there.
  for (const file of STYLE_FILES) {
    const css = read(`styles/${file}`)
    for (const [, query] of css.matchAll(/@media([^{]+)\{/g)) {
      if (!query.includes('max-width: 1023px')) continue
      assert.match(query, /pointer: coarse/, `${file}: "${query.trim()}" must require (pointer: coarse)`)
    }
  }
})

test('the desktop no-op is the exact complement of the mobile predicate', () => {
  const misc = read('styles/misc.css.ts')
  assert.match(misc, /@media \(min-width: 1024px\), \(pointer: fine\), \(pointer: none\)/)
})

test('no module builds its own width-only mobile query', () => {
  for (const file of ['index.tsx', 'effects/settings-toolbar-reparent.ts']) {
    assert.doesNotMatch(
      read(file),
      /matchMedia\('\(max-width: 1023px\)'\)/,
      `${file} must import MOBILE_QUERY instead of repeating the breakpoint`,
    )
  }
})

test('the shared predicate is pointer-gated', () => {
  const chrome = read('effects/phone-chrome.ts')
  assert.match(chrome, /export const MOBILE_QUERY = '\(max-width: 1023px\) and \(pointer: coarse\)'/)
  assert.match(chrome, /export const TOUCH_QUERY = '\(pointer: coarse\)'/)
})

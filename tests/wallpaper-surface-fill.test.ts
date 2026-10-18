import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const layout = readFileSync(new URL('../src/client/styles/layout.css.ts', import.meta.url), 'utf8')

test('the drawer keeps an opaque fill when a wallpaper plugin empties bg-base (dsh-web-mobile v3.2.0 #229)', () => {
  // deepseek-harness-background 0.6.x sets --dsw-alias-bg-base to transparent
  // on body[data-dsh-bg]; the token still exists, so var(--token, fallback)
  // never falls back and the drawer — whose only fill is bg-base — turns
  // transparent. Restore the opaque fill gated on the wallpaper attribute;
  // the ungated (no-wallpaper) path must keep resolving the token.
  assert.match(
    layout,
    /body\[data-dsh-bg\] \[data-mobile-nav="frame"\] > :first-child \{[\s\S]*?background: #ffffff !important;/,
    'light wallpaper-gated drawer fill is missing',
  )
  assert.match(
    layout,
    /body\[data-ds-dark-theme\]\[data-dsh-bg\] \[data-mobile-nav="frame"\] > :first-child \{[\s\S]*?background: #151517 !important;/,
    'dark wallpaper-gated drawer fill is missing',
  )
})

test('the base drawer rule still resolves the theme token', () => {
  // The base drawer rule must keep resolving the theme token so the
  // no-wallpaper path is byte-identical with and without this fix.
  const base = /\[data-mobile-nav="frame"\] > :first-child \{([\s\S]*?)\n  \}/.exec(layout)?.[1]
  assert.ok(base, 'base drawer rule is missing from layout.css.ts')
  assert.match(base, /background: var\(--dsw-alias-bg-base, #ffffff\);/)
})

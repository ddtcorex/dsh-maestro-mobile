import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { VIEWPORT_CONTENT, viewportContentFor } from '../src/client/effects/phone-chrome.ts'

const chrome = readFileSync(new URL('../src/client/effects/phone-chrome.ts', import.meta.url), 'utf8')

test('the plugin-owned viewport content keeps the notch inset and no zoom tokens', () => {
  assert.equal(
    VIEWPORT_CONTENT,
    'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content',
  )
  // iOS 10+ ignores maximum-scale for user pinch while other engines honour it,
  // so writing it would only take zoom away from Android. The focus-zoom fix is
  // the 16px field floor, not a zoom ban.
  assert.doesNotMatch(viewportContentFor('width=device-width, maximum-scale=1'), /maximum-scale|user-scalable/)
  assert.match(viewportContentFor(''), /viewport-fit=cover/)
})

test('the viewport opts Chrome for Android into the resize-content keyboard model (dsh-web-mobile v3.2.0 #226)', () => {
  // Chrome for Android without `interactive-widget` behaves as
  // `resizes-visual`: the keyboard only shrinks the visual viewport while the
  // layout viewport (what 100%/100dvh follow) stays full height, so the
  // browser pans the whole document and the top bar scrolls off-screen.
  // `resizes-content` restores the WebView model (layout viewport shrinks).
  // Engines that do not recognise the field (iOS Safari, Firefox Android)
  // ignore it, so their behaviour is unchanged.
  assert.match(VIEWPORT_CONTENT, /interactive-widget=resizes-content/)
  assert.match(viewportContentFor(''), /interactive-widget=resizes-content/)
})

test('the meta is re-asserted against host rewrites while armed', () => {
  // A host rewrite, a node replacement, or a meta injected after the effect
  // armed would silently drop viewport-fit=cover and shift every surface under
  // the notch.
  assert.match(chrome, /const assertViewport = \(\): void => \{/)
  assert.match(chrome, /new MutationObserver\(assertViewport\)/)
  assert.match(chrome, /metaObserver\.observe\(viewport, \{ attributes: true, attributeFilter: \['content'\] \}\)/)
  assert.match(chrome, /headObserver\.observe\(document\.head, \{ childList: true \}\)/)
  assert.match(chrome, /const attachMetaObserver = \(\): void => \{/)
})

test('dispose hands the meta back only while it still holds our content', () => {
  assert.match(chrome, /viewport\.content === VIEWPORT_CONTENT/)
  assert.match(chrome, /metaObserver\.disconnect\(\)/)
  assert.match(chrome, /headObserver\.disconnect\(\)/)
})

test('the plugin never writes a zoom-limiting token', () => {
  // Comments are allowed to name the tokens they explain; the assertion is
  // about what the code writes.
  const code = chrome.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
  assert.doesNotMatch(code, /maximum-scale/)
  assert.doesNotMatch(code, /user-scalable/)
})

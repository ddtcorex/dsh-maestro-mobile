import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const index = readFileSync(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
const misc = readFileSync(new URL('../src/client/styles/misc.css.ts', import.meta.url), 'utf8')
const composer = readFileSync(new URL('../src/client/styles/composer.css.ts', import.meta.url), 'utf8')
const locales = readFileSync(new URL('../src/client/i18n/locales.ts', import.meta.url), 'utf8')

test('the plugin contributes no composer tool-row entry', () => {
  // The one-tap attachment button was removed: on a phone the file picker is
  // reached through upstream's own "+" menu ("Add files or run commands"),
  // which already sits in the same tool row.
  assert.doesNotMatch(index, /conversation\.input\./)
  assert.doesNotMatch(index, /mobile-composer-attach/)
})

test('the attachment component and its marker are gone', () => {
  assert.equal(
    existsSync(new URL('../src/client/components/MobileComposerAttach.tsx', import.meta.url)),
    false,
    'MobileComposerAttach.tsx must be deleted',
  )
  assert.doesNotMatch(index, /attach/)
  assert.doesNotMatch(composer, /data-mobile-nav="attach"/)
  assert.doesNotMatch(misc, /data-mobile-nav="attach"/)
})

test('the attachment copy is dropped from both dictionaries', () => {
  assert.doesNotMatch(locales, /'attach'/)
})

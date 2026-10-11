import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { NS, zh, en } from '../src/client/i18n/locales.ts'

/**
 * Locale namespaces must carry the package prefix.
 *
 * Port of dsh-web-mobile v3.0.6 #165 / PR #167: two plugins that each
 * register a generic namespace (there: the mobile drawer copy embedded in
 * dsh-pocket) make the host `locale.register` throw on the duplicate, and
 * the throw sits on the whole entry activation path — so co-installing both
 * bricks the entire Web UI into an error page. Prefixing every namespace
 * (`dshWebMobileNav*` there, `dshMaestroMobileNav` here) removes the class.
 */

test('the locale namespace carries the package prefix', () => {
  assert.equal(NS, 'dshMaestroMobileNav')
  assert.match(NS, /^dshMaestroMobile/i, 'namespace must start with the package prefix, never a generic name')
})

test('no locale registration path still uses the generic mobileNav namespace', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
  const files = [
    'client/i18n/locales.ts',
    'client/index.tsx',
    'client/effects/phone-chrome.ts',
    'client/effects/session-menu.ts',
    'client/effects/preview-fullscreen.ts',
  ]
  const offenders: string[] = []
  for (const rel of files) {
    const text = readFileSync(join(root, rel), 'utf8')
    // String-literal uses of the bare namespace: locale.register / bind /
    // TranslateNS / LocaleNamespaceMap. `dataset.mobileNav` (the
    // data-mobile-nav DOM marker) and prose comments are fine and excluded
    // by requiring a quote character before mobileNav.
    if (/(['"])mobileNav\1/.test(text)) offenders.push(rel)
  }
  assert.deepEqual(offenders, [], 'generic \'mobileNav\' locale namespace must not remain in any registration path')
})

test('zh/en dictionaries stay key-identical', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort())
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const misc = readFileSync(new URL('../src/client/styles/misc.css.ts', import.meta.url), 'utf8')

const LIGHTBOX = 'div[role="dialog"][aria-modal="true"]:has(> :first-child > img)'

test('the image lightbox keeps a full-viewport hit area on tablet', () => {
  // Ported from dsh-web-mobile v3.2.1 #234: the tablet block caps every
  // [aria-modal="true"] to min(100vw - 32px, 720px) centered. The host
  // ImageLightbox (role=dialog + aria-modal, stage last child = close
  // button > svg) matches the cap's :not(...) branch, so fixed inset:0
  // keeps left and loses right — a dead strip on the right side. The
  // positive override below restores full-bleed; the leading div is load
  // bearing (same-specificity tablet rule would otherwise win by order).
  assert.ok(misc.includes(LIGHTBOX), 'the lightbox fullbleed override is missing from misc.css.ts')
  const at = misc.indexOf(LIGHTBOX)
  const body = misc.slice(at, misc.indexOf('}', at))
  assert.match(body, /max-width:\s*none\s*!important;/)
  assert.match(body, /margin-(left|right):\s*0\s*!important;|inset:\s*0\s*!important;/)
})

test('the lightbox override wins over the tablet dialog cap by order', () => {
  // Same-file source order decides ties: the override must come after the
  // tablet 720px cap so it wins where both match.
  const cap = misc.indexOf('max-width: min(calc(100vw - 32px), 720px)')
  assert.ok(cap >= 0, 'the tablet dialog cap is missing from misc.css.ts')
  assert.ok(
    misc.indexOf('div[role="dialog"][aria-modal="true"]') > cap,
    'the lightbox override must follow the tablet cap in misc.css.ts',
  )
})

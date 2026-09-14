import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { detectIosWebKit } from '../src/client/effects/phone-chrome.ts'

const misc = readFileSync(new URL('../src/client/styles/misc.css.ts', import.meta.url), 'utf8')
const composer = readFileSync(new URL('../src/client/styles/composer.css.ts', import.meta.url), 'utf8')

const IOS_PROBE = '(font: -apple-system-body) and (-webkit-touch-callout: none)'
const supportsTrue = (condition: string): boolean => condition === IOS_PROBE
const supportsFalse = (): boolean => false

test('the CSS feature probe is the reliable iOS signal', () => {
  // -apple-system-body is Safari-only and -webkit-touch-callout is an iOS
  // property, so the pair is true on iOS WebKit (Chrome/Edge/Opera on iOS are
  // WebKit and zoom identically) and false on Chromium and macOS Safari.
  assert.equal(detectIosWebKit({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', maxTouchPoints: 5 }, supportsTrue), true)
  assert.equal(detectIosWebKit({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/140', maxTouchPoints: 0 }, supportsFalse), false)
})

test('the UA fallback covers engines whose supports() is missing or disagrees', () => {
  assert.equal(detectIosWebKit({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', maxTouchPoints: 5 }, null), true)
  assert.equal(detectIosWebKit({ userAgent: 'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X)', maxTouchPoints: 5 }, null), true)
  // iPadOS 13+ reports a Macintosh UA; touch points are what tell it apart.
  assert.equal(detectIosWebKit({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 }, null), true)
  assert.equal(detectIosWebKit({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 }, null), false)
  assert.equal(detectIosWebKit({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', maxTouchPoints: 0 }, null), false)
})

test('a throwing supports() falls through to the UA test', () => {
  const throwing = (): boolean => {
    throw new Error('unsupported condition string')
  }
  assert.equal(detectIosWebKit({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', maxTouchPoints: 5 }, throwing), true)
  assert.equal(detectIosWebKit({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', maxTouchPoints: 0 }, throwing), false)
})

test('the 16px floor is iOS-gated and covers every text entry control', () => {
  // Android and desktop keep their compact 13-14px fields; only iOS WebKit
  // zooms the viewport on focus, so only iOS needs the floor. Comments are
  // stripped so a selector match cannot be satisfied by prose.
  const miscCode = misc.replace(/\/\*[\s\S]*?\*\//g, '')
  const floor = /html\[data-mobile-nav-ios\][^{]*\{[^}]*font-size: 16px !important;/.exec(miscCode)?.[0]
  assert.ok(floor, 'the iOS 16px floor is missing from misc.css.ts')
  assert.match(floor, /html\[data-mobile-nav-ios\] textarea/)
  assert.match(floor, /html\[data-mobile-nav-ios\] \[contenteditable\]:not\(\[contenteditable="false"\]\)/)
  assert.match(floor, /html\[data-mobile-nav-ios\] \[data-question-key\] \[class\*="_fieldMirror"\]/)
  assert.match(floor, /html\[data-mobile-nav-ios\] input:not\(\[type="button"\]\)/)
  assert.doesNotMatch(floor, /select/)
})

test('the CSS feature probe needs a touch screen to count', () => {
  // macOS Safari implements both halves of the feature probe, so the probe
  // alone cannot tell a desktop Mac from an iPhone. The touch-point count is
  // what separates them: a Mac reports 0, every iOS device reports > 0.
  assert.equal(detectIosWebKit({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 }, supportsTrue), false)
  assert.equal(detectIosWebKit({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', maxTouchPoints: 0 }, supportsTrue), false)
  assert.equal(detectIosWebKit({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', maxTouchPoints: 5 }, supportsTrue), true)
})

test('the 16px floor is not trapped inside the phone breakpoint', () => {
  // iOS zooms a <16px field at EVERY width and pointer (iPad landscape and
  // desktop-mode iPadOS never match the phone media), so the floor must live
  // outside the width/pointer media query, gated on the iOS marker alone.
  // Comments are stripped so prose cannot satisfy the match (pitfalls).
  const code = misc.replace(/\/\*[\s\S]*?\*\//g, '')
  const floorAt = code.indexOf('html[data-mobile-nav-ios] textarea')
  assert.ok(floorAt !== -1, 'the iOS 16px floor is missing from misc.css.ts')
  for (const range of mediaRanges(code)) {
    if (!/max-width:\s*1023px/.test(range.header)) continue
    assert.ok(floorAt < range.start || floorAt > range.end, 'the iOS 16px floor must not sit inside the phone media query')
  }
})

test('the iOS marker is armed outside the phone breakpoint', () => {
  // The marker must be set by an ungated effect: installPhoneChrome only runs
  // while the phone media matches, so an iPad that never matches it would
  // never carry the marker the floor is gated on.
  const chrome = readFileSync(new URL('../src/client/effects/phone-chrome.ts', import.meta.url), 'utf8')
  assert.match(chrome, /export function installIosZoomGuard/)
  const index = readFileSync(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
  assert.match(index, /installIosZoomGuard\(ctx\)/)
})

/** Byte ranges of every top-level @media block in CSS source. */
function mediaRanges(code: string): { header: string; start: number; end: number }[] {
  const ranges: { header: string; start: number; end: number }[] = []
  const re = /@media[^{]*\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(code)) !== null) {
    let depth = 1
    let i = m.index + m[0].length
    while (i < code.length && depth > 0) {
      if (code[i] === '{') depth += 1
      else if (code[i] === '}') depth -= 1
      i += 1
    }
    ranges.push({ header: m[0], start: m.index, end: i })
  }
  return ranges
}

test('no ungated 16px field floor survives outside the iOS gate', () => {
  for (const [file, css] of [['misc.css.ts', misc], ['composer.css.ts', composer]] as const) {
    for (const [, selector] of css.matchAll(/([^{}]*)\{[^}]*font-size: 16px !important;/g)) {
      const trimmed = selector.trim()
      if (!/textarea|input|contenteditable|_fieldMirror|_fieldInput/.test(trimmed)) continue
      assert.match(trimmed, /html\[data-mobile-nav-ios\]/, `${file}: "${trimmed}" must be iOS-gated`)
    }
  }
})

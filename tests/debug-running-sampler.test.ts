import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { debugFlagFromUrl, describeRunningSample } from '../src/client/debug.ts'

const debug = readFileSync(new URL('../src/client/debug.ts', import.meta.url), 'utf8')

test('the running sampler line rounds geometry into a stable key', () => {
  // The trace keeps a line only on change, so fractional sub-pixels must not
  // produce a new line every 400ms on their own.
  assert.equal(
    describeRunningSample({ top: 583.2, height: 52.4, dividerDisplay: 'block', scrollTop: 1203 }),
    'run top=583 h=52 div=block scTop=1203',
  )
  assert.equal(
    describeRunningSample({ top: 583.2, height: 52.4, dividerDisplay: 'block', scrollTop: 1203 }),
    describeRunningSample({ top: 583.4, height: 52.49, dividerDisplay: 'block', scrollTop: 1203.2 }),
  )
})

test('the sampler reads the running row through stable markers only', () => {
  // Same rule as the stylesheet: a hashed class dies on the next upstream
  // build while every assertion still passes. The row owns
  // data-chat-running, its divider is the second of exactly three spans
  // (RunningStatus.tsx), and the scrollport owns data-conversation-scroll.
  assert.match(debug, /querySelector\('\[data-chat-running\]'\)/)
  assert.match(debug, /querySelector\(':scope > span:nth-of-type\(2\)'\)/)
  assert.match(debug, /querySelector\('\[data-conversation-scroll\]'\)/)
})

test('the badge head reports the running-row bundle readout', () => {
  // The computed style versions the bundle (static+0px predates every fix,
  // static+12px is clearance only, sticky+12px carries all three), so the
  // head must render it where a phone screenshot can show it.
  assert.match(debug, /`run \${describeRunningHead\(\)}`/)
})

test('the debug badge arms from the query params or the hash fragment', () => {
  // A PIN/token redirect drops the query string on the way back to the bare
  // origin, while the fragment never leaves the browser and survives — so
  // the hash is the reliable phone-side switch.
  assert.equal(debugFlagFromUrl('?dsh-maestro-mobile-debug=1', ''), true)
  assert.equal(debugFlagFromUrl('?mobile-nav-debug=1', ''), true)
  assert.equal(debugFlagFromUrl('', '#dsh-maestro-mobile-debug'), true)
  assert.equal(debugFlagFromUrl('?x=1', ''), false)
  assert.equal(debugFlagFromUrl('', ''), false)
  assert.equal(debugFlagFromUrl('', '#other'), false)
})

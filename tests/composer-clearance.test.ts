import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { composerOccludedPx, nextComposerTight } from '../src/client/core/composer-clearance.ts'
import { LAYOUT_CSS } from '../src/client/styles/layout.css.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const INDEX = readFileSync(join(ROOT, 'src/client/index.tsx'), 'utf8')

const BAND = {
  visibleHeight: 112,
  headerBottom: 67,
  seatHeight: 102,
  seatBottom: 112,
  scrollY: 0,
  offsetTop: 0,
}

test('landscape reporter geometry occludes the editing row', () => {
  assert.equal(composerOccludedPx(BAND), 57)
})

test('a partially covered seat is a small occlusion', () => {
  assert.equal(composerOccludedPx({ ...BAND, visibleHeight: 160, seatBottom: 160 }), 9)
})

test('portrait with keyboard up leaves no occlusion', () => {
  assert.equal(composerOccludedPx({ ...BAND, visibleHeight: 480, seatBottom: 480 }), 0)
})

test('channel drift fails open', () => {
  assert.equal(composerOccludedPx({ ...BAND, offsetTop: 200 }), 0)
})

test('garbage readings rest at zero', () => {
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.equal(composerOccludedPx({ ...BAND, visibleHeight: bad }), 0)
    assert.equal(nextComposerTight(false, bad), false)
  }
})

test('tight marker needs a real overlap and clears only at zero', () => {
  assert.equal(nextComposerTight(false, 0), false)
  assert.equal(nextComposerTight(false, 1), true)
  assert.equal(nextComposerTight(true, 1), true)
  assert.equal(nextComposerTight(true, 0), false)
})

test('tight CSS lifts the seat above the header', () => {
  assert.match(LAYOUT_CSS, /data-mobile-nav-composer-tight/)
  assert.match(LAYOUT_CSS, /\[data-composer-seat\][\s\S]*?z-index:\s*31/)
})

test('the clearance effect is registered', () => {
  assert.match(INDEX, /installComposerClearance/)
})

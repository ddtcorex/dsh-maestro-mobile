import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { answerFieldScrollTop, hostCardHeightPx, nextQuestionFull, questionBandPx } from '../src/client/core/question-fullscreen.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const INDEX = readFileSync(join(ROOT, 'src/client/index.tsx'), 'utf8')
const COMPOSER = readFileSync(join(ROOT, 'src/client/styles/composer.css.ts'), 'utf8')
const LOCALES = readFileSync(join(ROOT, 'src/client/i18n/locales.ts'), 'utf8')

test('portrait band beats the host ceiling and arms on request', () => {
  const band = questionBandPx({ visibleHeight: 492, headerHeight: 67, frameBottom: 492, seatBottom: 492, framePadding: 16 })
  assert.equal(band.reservePx, 16)
  assert.equal(band.bandPx, 409)
  assert.equal(nextQuestionFull(false, true, band.bandPx, hostCardHeightPx(492)), true)
})

test('a keyboard-shrunken landscape band refuses to arm', () => {
  const band = questionBandPx({ visibleHeight: 112, headerHeight: 67, frameBottom: 112, seatBottom: 112, framePadding: 16 })
  assert.equal(nextQuestionFull(false, true, band.bandPx, hostCardHeightPx(112)), false)
})

test('manual toggle wins and garbage fails open', () => {
  assert.equal(nextQuestionFull(true, false, 409, 295), false)
  assert.equal(nextQuestionFull(false, true, 0, 295), false)
  assert.deepEqual(questionBandPx({ visibleHeight: Number.NaN, headerHeight: 67, frameBottom: 492, seatBottom: 492, framePadding: 16 }), { reservePx: 0, bandPx: 0 })
})

test('answer scroll returns the field into the body intersect viewport', () => {
  const base = { fieldTop: 400, fieldBottom: 496, bodyTop: 300, bodyBottom: 600, scrollTop: 0, scrollHeight: 500, clientHeight: 300 }
  assert.ok(answerFieldScrollTop({ ...base, fieldBottom: 700, bodyBottom: 600 }) > 0)
  assert.equal(answerFieldScrollTop({ ...base }), 0)
  assert.equal(answerFieldScrollTop({ ...base, fieldTop: 100, bodyTop: 300, scrollTop: 300, scrollHeight: 900, visibleTop: 350, visibleBottom: 600 }), 42)
})

test('the fullscreen effect and copy are wired', () => {
  assert.match(INDEX, /installQuestionFullscreen/)
  assert.match(LOCALES, /questionExpand/)
  assert.match(LOCALES, /questionCollapse/)
  assert.match(COMPOSER, /data-mobile-nav-question-full/)
  assert.match(COMPOSER, /--mobile-question-band/)
})

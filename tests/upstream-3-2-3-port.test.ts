import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const layout = read('src/client/styles/layout.css.ts')
const guard = read('src/client/effects/session-focus-guard.ts')
const question = read('src/client/effects/question-fullscreen.ts')

// Ports from mexiaosqwq/dsh-web-mobile v3.2.3 (#258, #260). Each one is a
// behaviour this plugin can carry without the upstream visible-band shell:
// a composer row that should only be yielded in landscape, an observer that
// should not be awake during streaming, and a card lookup that should not walk
// the whole document on every mutation batch.

test('the stats row is yielded only in landscape, so portrait keeps its composer height', () => {
  const rule = '[data-mobile-nav-composer-tight] [data-mobile-nav="stats"] {'
  const occurrences = layout.split(rule).length - 1
  assert.equal(occurrences, 1, 'the tight rule must exist exactly once')
  // It has to sit inside the landscape media block: the block opens before the
  // rule and the nearest media query above it is the orientation one.
  const ruleAt = layout.indexOf(rule)
  const mediaAt = layout.lastIndexOf('@media (orientation: landscape) {', ruleAt)
  assert.ok(mediaAt > 0, 'the tight rule is not inside an orientation media query')
  const between = layout.slice(mediaAt, ruleAt)
  assert.equal((between.match(/\{/g) ?? []).length, 1, 'the rule escaped the media block')
})

test('the focus guard connects its tree observer only while the window is open', () => {
  const arm = /const arm = \(\): void => \{([\s\S]*?)\n    \}/.exec(guard)?.[1]
  assert.notEqual(arm, undefined, 'arm() not found')
  assert.match(arm, /observer\.observe\(document\.documentElement/, 'arm() must connect the observer')

  const restore = /const restore = \(\): void => \{([\s\S]*?)\n    \}/.exec(guard)?.[1]
  assert.notEqual(restore, undefined, 'restore() not found')
  assert.match(restore, /observer\.disconnect\(\)/, 'restore() must disconnect the observer')

  // No permanent connection at setup time: that is the streaming cost.
  const setup = guard.replace(/const arm = \(\): void => \{[\s\S]*?\n    \}/, '')
  assert.doesNotMatch(setup, /observer\.observe\(/u, 'an observer is connected outside the window')
})

test('the question card lookup is scoped to the composer seat and cached', () => {
  assert.match(question, /seatCache/u, 'seat must be cached')
  assert.match(question, /cardCache/u, 'card must be cached')
  assert.match(
    question,
    /const cardOf = \(\): HTMLElement \| null => \{[\s\S]*?scope\.querySelector<HTMLElement>\(CARD_SELECTOR\)/u,
    'the card must be queried inside the seat, not the document',
  )
  // The document-wide query survives only as the fallback for a host whose
  // card is not inside the seat.
  const documentQueries = question.match(/document\.querySelector<HTMLElement>\(CARD_SELECTOR\)/gu) ?? []
  assert.equal(documentQueries.length, 1, 'exactly one document-wide fallback is allowed')
})

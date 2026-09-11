import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const layout = readFileSync(new URL('../src/client/styles/layout.css.ts', import.meta.url), 'utf8')
const composer = readFileSync(new URL('../src/client/styles/composer.css.ts', import.meta.url), 'utf8')
const misc = readFileSync(new URL('../src/client/styles/misc.css.ts', import.meta.url), 'utf8')

const SESSION_HEADER =
  /\[data-mobile-nav="frame"\] \[data-phase\] \[data-slot="conversation\.session\.header"\] > header/

test('the session-header rules never reach a nested <header> such as the Ask card', () => {
  // Every session-header selector is anchored on the header's own slot seat
  // (data-slot="conversation.session.header"). A plain descendant `header`
  // also matched the Ask card (ask_user_question), turning its heading block
  // into a flex row and its <h2> question into a flex item that could not
  // shrink below an unbreakable token — the question then painted ~1100px
  // wide inside a 324px card and was clipped by the card's overflow:hidden.
  assert.doesNotMatch(layout, /\[data-phase\] header/)
  assert.match(layout, SESSION_HEADER)
})

test('every session-header rule in the block carries the seat anchor', () => {
  // Regression guard for the whole block: an unanchored addition re-breaks the
  // Ask card without failing any geometry test.
  const block = layout.slice(layout.indexOf('--- Session header on mobile ---'))
  const selectors = block.split('\n').filter(line => /header\b/.test(line) && line.trim().endsWith('{'))
  assert.ok(selectors.length >= 20, `expected the session-header block, saw ${String(selectors.length)} selectors`)
  for (const selector of selectors) {
    assert.match(selector, SESSION_HEADER, `unanchored session-header rule: ${selector.trim()}`)
  }
})

test('long unbreakable question text wraps inside the Ask card', () => {
  // The card clips horizontally, so a token without a break opportunity is
  // clipped mid-word instead of overflowing visibly. anywhere (not
  // break-word) also lowers the min-content size, which is what lets an option
  // label shrink inside the option row's flex line.
  const rule = /\[data-question-key\] \[class\*="_title"\],([\s\S]*?)\n  \}/.exec(composer)?.[1]
  assert.ok(rule, 'the Ask card wrap rule is missing from composer.css.ts')
  assert.match(rule, /\[data-question-key\] \[class\*="_optionLine"\],/)
  assert.match(rule, /\[data-question-key\] \[class\*="_detail"\] \{/)
  assert.match(rule, /overflow-wrap: anywhere !important;/)
})

test('a long question scrolls the card instead of clipping its options', () => {
  // The card caps at min(60vh, 520px) and upstream delegates scrolling to the
  // option list alone, while the question sits in the fixed header. A question
  // that wraps past the cap therefore spends the whole budget, the option seat
  // computes to zero height and the footer is pushed below the clip — the
  // choices and Submit are unreachable on a phone (mobile report 2026-09-11).
  const card = /\[data-question-key\] \[class\*="_card"\] \{([\s\S]*?)\n  \}/.exec(composer)?.[1]
  assert.ok(card, 'the Ask card rule is missing from composer.css.ts')
  assert.match(card, /overflow-y: auto !important;/)
  assert.match(card, /overscroll-behavior-y: contain !important;/)

  // Both the question and the option seat must flow inside that one scrollport
  // instead of shrinking or opening a second one.
  const seat = /\[data-question-key\] \[class\*="_card"\] > header,([\s\S]*?)\n  \}/.exec(composer)?.[1]
  assert.ok(seat, 'the Ask card scroll seat rule is missing from composer.css.ts')
  assert.match(seat, /\[data-question-key\] \[data-question-scroll\] \{/)
  assert.match(seat, /flex: 0 0 auto !important;/)
  assert.match(seat, /overflow: visible !important;/)
})

test('the iOS zoom guard targets the current answer-field classes', () => {
  // Upstream renamed the answer stack to .field / .fieldInput / .fieldMirror;
  // the guard kept matching the dead .customInput / .customTextarea names, so
  // iOS Safari zoomed the whole viewport on focus. The mirror sizes the
  // auto-grown field, so it must carry the same 16px as the textarea.
  const guard = /\[data-question-key\] \[class\*="_fieldInput"\],\s*\n\s*\[data-question-key\] \[class\*="_fieldMirror"\] \{\s*\n\s*font-size: 16px !important;/
  assert.match(composer, guard)
  assert.match(misc, guard)
  assert.doesNotMatch(composer + misc, /_customInput|_customTextarea/)
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const layout = readFileSync(new URL('../src/client/styles/layout.css.ts', import.meta.url), 'utf8')
const composer = readFileSync(new URL('../src/client/styles/composer.css.ts', import.meta.url), 'utf8')

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
  // The card is overflow:hidden, so a token without a break opportunity is
  // clipped mid-word instead of overflowing visibly. anywhere (not
  // break-word) also lowers the min-content size, which is what lets an option
  // label shrink inside the option row's flex line.
  const rule = /\[data-question-key\] \[class\*="_title"\],([\s\S]*?)\n  \}/.exec(composer)?.[1]
  assert.ok(rule, 'the Ask card wrap rule is missing from composer.css.ts')
  assert.match(rule, /\[data-question-key\] \[class\*="_optionLine"\],/)
  assert.match(rule, /\[data-question-key\] \[class\*="_detail"\] \{/)
  assert.match(rule, /overflow-wrap: anywhere !important;/)
})

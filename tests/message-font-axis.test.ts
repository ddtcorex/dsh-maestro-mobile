import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const layout = readFileSync(new URL('../src/client/styles/layout.css.ts', import.meta.url), 'utf8')

/**
 * Strip block comments so prose above a rule can never satisfy (or fail) a
 * selector assertion. Same guard the other CSS contract tests use.
 */
const css = layout.replace(/\/\*[\s\S]*?\*\//g, '')

/**
 * The host publishes the user's content font size as --dsh-content-font-size
 * on <body> (ui-layout ThemePresenter.apply) and derives its own markdown
 * tokens from it (--dsw-font-markdown-base). A hardcoded px with !important
 * therefore does not just pick a phone default -- it makes the host
 * typography setting a dead control on every touch device.
 */
test('message text follows the host content font-size axis', () => {
  assert.match(
    css,
    /\[data-phase\]\s*\[class\*="_scroll"\]:not\(\[class\*="_scrollBody"\]\):has\(p\)\s*\{[^}]*font-size:\s*max\(15px,\s*var\(--dsh-content-font-size,\s*14px\)\)\s*!important;/s,
    'the message container must derive its size from --dsh-content-font-size',
  )
  assert.match(
    css,
    /\[class\*="_text_"\]\s*\{[^}]*font-size:\s*max\(15px,\s*var\(--dsh-content-font-size,\s*14px\)\)\s*!important;/s,
    'message paragraphs / list items must derive their size from the same axis',
  )
})

test('no message rule pins a bare 15px over the host setting', () => {
  const messageBlocks = css.match(/\[data-phase\][^{]*\{[^}]*font-size[^}]*\}/gs) ?? []
  assert.ok(messageBlocks.length > 0, 'expected to find message font-size rules')
  for (const block of messageBlocks) {
    assert.doesNotMatch(
      block,
      /font-size:\s*15px\s*!important/,
      `a bare 15px!important survives in: ${block.trim().slice(0, 80)}`,
    )
  }
})

/**
 * The 16px iOS focus-zoom floor is a separate, deliberate guarantee: typing
 * into a field under 16px makes mobile Safari zoom the page. Raising the
 * user's content size must never push message text below that floor.
 */
test('the phone floor is preserved at the default setting', () => {
  assert.match(
    css,
    /font-size:\s*max\(15px,\s*var\(--dsh-content-font-size,\s*14px\)\)/,
    'max() keeps 15px as the floor while letting a larger setting through',
  )
})

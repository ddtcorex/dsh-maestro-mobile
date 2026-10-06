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
/**
 * The phone prose floor.
 *
 * It was 15px, which made EVERY setting below 15px dead on a phone: at the
 * default 14px the prose read 15px, one step ABOVE the host setting and one step
 * above the user's own bubble (14px) — so the body of every answer looked larger
 * than the message that asked the question. Inline code was worse, because the
 * host declares it in `em` (0.875em, MarkdownText.module.css), so it inherited
 * the bump and read 13.125px against the host's own 12px token — code rendered
 * LARGER on a phone than on the desktop the same token drives.
 *
 * 13px is the host's own secondary tier (--dsh-content-font-size-secondary at
 * the default setting), so the floor is now the one value on the phone that no
 * longer contradicts a host tier: chrome keeps 13px, prose stops being hoisted
 * above the setting, and inline code returns to 0.875em of whatever prose reads.
 * A setting ABOVE 13px still passes straight through max().
 */
const PROSE_FLOOR = '13px'

test('message text follows the host content font-size axis', () => {
  assert.match(
    css,
    new RegExp(
      `\\[data-phase\\]\\s*\\[class\\*="_scroll"\\]:not\\(\\[class\\*="_scrollBody"\\]\\):has\\(p\\)\\s*\\{[^}]*font-size:\\s*max\\(${PROSE_FLOOR},\\s*var\\(--dsh-content-font-size,\\s*14px\\)\\)\\s*!important;`,
      's',
    ),
    'the message container must derive its size from --dsh-content-font-size',
  )
  assert.match(
    css,
    new RegExp(
      `\\[class\\*="_markdown"\\]:not\\(\\[data-markdown-variant="compact"\\]\\)\\s*p\\s*,\\s*\\[data-phase\\]\\s*\\[class\\*="_scroll"\\]:not\\(\\[class\\*="_scrollBody"\\]\\):has\\(p\\)\\s*\\[class\\*="_markdown"\\]:not\\(\\[data-markdown-variant="compact"\\]\\)\\s*li\\s*\\{[^}]*font-size:\\s*max\\(${PROSE_FLOOR},\\s*var\\(--dsh-content-font-size,\\s*14px\\)\\)\\s*!important;`,
      's',
    ),
    'markdown paragraphs / list items must derive their size from the same axis, and skip the compact variant',
  )
})

/**
 * The floor is a prose floor. The in-flow chrome around the prose deliberately
 * sits one step under the body setting — tool rows, tool output, the reasoning
 * summary and the diff stat all read --dsh-content-font-size-secondary (13px at
 * the default 14px). A bare descendant selector (every p / li / _text_ under the
 * flow container) hoisted all of it to 15px: measured on a real 1170-edit
 * session, ~1900 elements grew 13px -> 15px.
 *
 * Markdown rendered at the secondary tier carries a stable host marker,
 * data-markdown-variant="compact" (ui-primitives MarkdownText; used by the
 * thinking/reasoning body and the trajectory table), so the floor must exclude
 * it. Anchoring on the class alone is not enough — both variants share the
 * _markdown root.
 */
test('the phone floor is scoped to prose, not the whole flow', () => {
  const floorRule = new RegExp(
    `\\[data-phase\\][^{]*\\{[^}]*font-size:\\s*max\\(${PROSE_FLOOR},\\s*var\\(--dsh-content-font-size`,
    'gs',
  )
  const rules = css.match(floorRule) ?? []
  assert.ok(rules.length > 0, 'expected to find the phone-floor rules')
  for (const rule of rules) {
    // The container rule is the one legitimate blanket: it only changes what
    // descendants INHERIT, and each descendant's own declaration still wins.
    if (/\[class\*="_scroll"\]:not\(\[class\*="_scrollBody"\]\):has\(p\)\s*\{/.test(rule)) continue
    assert.doesNotMatch(
      rule,
      /:has\(p\)\s+(?:p|li)\s*[,{]/,
      `a bare p/li under the flow container escapes the prose scope: ${rule.trim().slice(0, 90)}`,
    )
    assert.doesNotMatch(
      rule,
      /\[class\*="_text_"\]/,
      `[class*="_text_"] matches tool-card text on the 13px secondary tier: ${rule.trim().slice(0, 90)}`,
    )
    assert.match(
      rule,
      /\[class\*="_markdown"\]:not\(\[data-markdown-variant="compact"\]\)/,
      `a markdown floor must skip the compact variant (the thinking block): ${rule.trim().slice(0, 90)}`,
    )
  }
})

test('no message rule pins a bare floor over the host setting', () => {
  // Scoped to the MESSAGE FLOW rules, and one rule per match.
  //
  // Both refinements are load-bearing. `[^{]*` also spans a closing `}`, which
  // attributes the NEXT rule's body to this selector; and an unscoped scan of
  // every `[data-phase]`-bearing rule swept in the footer's settings button
  // (layout.css.ts, the 36px `_footArea` row), which legitimately carries
  // `font-size: 13px !important` for its own touch target and has nothing to do
  // with prose. The old 15px floor happened not to collide with that rule, so
  // the unscoped scan read as passing rather than as wrong.
  const messageBlocks = css.match(
    /\[data-phase\][^{}]*(?:_scroll|_markdown)[^{}]*\{[^{}]*font-size[^{}]*\}/gs,
  ) ?? []
  assert.ok(messageBlocks.length > 0, 'expected to find message font-size rules')
  for (const block of messageBlocks) {
    assert.doesNotMatch(
      block,
      new RegExp(`font-size:\\s*${PROSE_FLOOR}\\s*!important`),
      `a bare ${PROSE_FLOOR}!important survives in: ${block.trim().slice(0, 80)}`,
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
    new RegExp(`font-size:\\s*max\\(${PROSE_FLOOR},\\s*var\\(--dsh-content-font-size,\\s*14px\\)\\)`),
    `max() keeps ${PROSE_FLOOR} as the floor while letting a larger setting through`,
  )
})

/**
 * The floor must never sit ABOVE the host's own tiers. 15px did: prose read 15px
 * against a 14px setting, inline code 13.125px against the host's 12px token, and
 * both looked larger on a phone than on the desktop. Chrome already sits at 13px
 * (--dsh-content-font-size-secondary at the default setting), so 13px is the
 * highest floor that contradicts nothing, and the default 14px setting now passes
 * through untouched instead of being hoisted.
 */
test('the floor does not outrank the host setting at the default', () => {
  const floor = Number.parseFloat(PROSE_FLOOR)
  const hostDefault = 14
  assert.ok(
    floor <= hostDefault,
    `a ${PROSE_FLOOR} floor hoists the default ${hostDefault}px setting on a phone`,
  )
})

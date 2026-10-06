import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const layout = readFileSync(new URL('../src/client/styles/layout.css.ts', import.meta.url), 'utf8')
const misc = readFileSync(new URL('../src/client/styles/misc.css.ts', import.meta.url), 'utf8')

/**
 * Strip block comments so prose can never satisfy a selector assertion. Same
 * guard the other CSS contract tests use.
 */
const css = `${layout}\n${misc}`.replace(/\/\*[\s\S]*?\*\//g, '')

/**
 * WebKit text autosizing.
 *
 * iOS Safari recomputes font-size per block and inflates any block whose text
 * it judges too small for its container. `--dsw-font-markdown-code-block` is a
 * hard 11px, and a code line that overflows is exactly the case the heuristic
 * acts on, so on a phone code rendered at 11px measured ~14px — visually equal
 * to the 14px prose, which erased the host's deliberate 3px code/prose step.
 * Measured from a phone screenshot of this session (1206px @3x => 402px
 * viewport): a monospace char and a prose char were the same size.
 *
 * Chromium never applies the heuristic, so every computed-style probe reports
 * 11px and reads as "nothing is wrong". That gap is why this is pinned here
 * rather than left to a probe.
 *
 * `text-size-adjust: 100%` opts the subtree out; it is inherited, so covering
 * the code roots covers their lines.
 */
test('code surfaces opt out of WebKit text autosizing', () => {
  assert.match(
    css,
    /\.md-code-block[^{]*\{[^}]*-webkit-text-size-adjust:\s*100%[^}]*\}/s,
    'md-code-block (the host\'s un-hashed code-block hook) must opt out of autosizing',
  )
})

test('the autosizing opt-out keeps the prefixed and standard forms', () => {
  // Safari needs -webkit-text-size-adjust; the standard property carries the
  // same value so a non-WebKit engine that implements it agrees.
  assert.match(
    css,
    /\.md-code-block[^{]*\{[^}]*-webkit-text-size-adjust:\s*100%/s,
    'the -webkit- prefixed property is required for Safari',
  )
  assert.match(
    css,
    /\.md-code-block[^{]*\{[^}]*text-size-adjust:\s*100%/s,
    'the standard property must carry the same value',
  )
})

/**
 * DiffBlock and ReadBlock share CodeCard's chrome but not CodeBlock's
 * `md-code-block` class — the host renders them with `data-diff` / `data-read`
 * instead. Their bodies declare the same 11px token, so they are equally
 * exposed to the same inflation.
 */
test('diff and read cards opt out too, via their own host markers', () => {
  assert.match(css, /\[data-diff\][^{]*\{[^}]*text-size-adjust:\s*100%/s, 'data-diff needs the opt-out')
  assert.match(css, /\[data-read\][^{]*\{[^}]*text-size-adjust:\s*100%/s, 'data-read needs the opt-out')
})

/**
 * Settings fields hit the identical mechanism: the host sizes them at 13px,
 * below what WebKit considers comfortable for an input, so iOS inflated them.
 * The autocompleting fields on the Maestro tabs are the measured case.
 */
test('settings text-entry fields opt out of autosizing', () => {
  assert.match(
    css,
    /\[data-phase\][^{]*\binput\b[^{]*\{[^}]*text-size-adjust:\s*100%/s,
    'settings inputs must opt out of autosizing',
  )
  assert.match(
    css,
    /\[data-phase\][^{]*textarea[^{]*\{[^}]*text-size-adjust:\s*100%/s,
    'settings textareas must opt out of autosizing',
  )
})

/**
 * Inline `code` spans are a third surface. The host sizes them in em
 * (0.875em, MarkdownText.module.css), so they are monospace at 12.25px — below
 * the heuristic's threshold, and never covered by md-code-block, which wraps
 * fenced blocks only. A live audit of this session found 100+ such spans still
 * reading text-size-adjust: auto.
 *
 * The diff stat chips (+N / -N) are a fourth: they read
 * --dsw-font-markdown-code-block (11px) and sit on the tool row itself, outside
 * [data-diff], so a card collapsed to its summary is exposed even though the
 * card body is not. That is the "diff block in the sidebar" report.
 */
test('inline code and diff stat chips opt out too', () => {
  assert.match(
    css,
    /\[data-phase\][^{]*\bcode\b[^{]*\{[^}]*text-size-adjust:\s*100%/s,
    'inline code spans must opt out of autosizing',
  )
  assert.match(
    css,
    /\[class\*="diff(?:Added|Removed|Stat)"\][^{]*\{[^}]*text-size-adjust:\s*100%/s,
    'diff stat chips must opt out — they are readable on a collapsed tool row',
  )
})

/**
 * The deliverables panel (Changed Files / Review) carries its own line-level
 * +N / -N chips from ui-deliverables' ChangedFiles.module.css (.added /
 * .deleted) reading the 11px code-block token. It renders in the right panel
 * rather than the conversation flow, so neither [data-phase] nor the tool-row
 * chips above reach it — found by auditing this session's rendered nodes, whose
 * class hash b_3B4W traced back to ui-deliverables/lib/client.js.
 */
test('the deliverables review panel opts out too', () => {
  for (const marker of ['data-changed-files', 'data-changes-review', 'data-review-file', 'data-review-view']) {
    assert.match(
      css,
      new RegExp(`\\[${marker}\\][^{]*\\{[^}]*text-size-adjust:\\s*100%`, 's'),
      `${marker} needs the opt-out — its +N/-N chips render at 11px`,
    )
  }
})

/**
 * The opt-out must be scoped to surfaces, never applied to the document. Setting
 * it on html would return every small host surface to its declared size at once
 * — a far larger typography decision than this fix.
 *
 * The iOS marker makes the selector literally start with `html`, so the bare
 * name is not the signal; a root opt-out is one with no marker and no
 * qualifying class or attribute after it.
 */
test('the opt-out is scoped, never set on the root element', () => {
  const roots = css.match(/(?:^|[,{}])\s*(?:html|:root|body)(?![\w-]*[\[.#])[^{},]*\{[^}]*text-size-adjust/s) ?? []
  assert.deepEqual(
    roots.map((rule) => rule.trim().slice(0, 80)),
    [],
    'text-size-adjust must not be set on an unmarked document root',
  )
})
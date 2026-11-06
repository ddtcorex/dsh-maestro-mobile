import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const layout = readFileSync(new URL('../src/client/styles/layout.css.ts', import.meta.url), 'utf8')
const composer = readFileSync(new URL('../src/client/styles/composer.css.ts', import.meta.url), 'utf8')
const misc = readFileSync(new URL('../src/client/styles/misc.css.ts', import.meta.url), 'utf8')

const SESSION_HEADER =
  /\[data-mobile-nav="frame"\] \[data-phase\] \[data-slot="conversation\.session\.header"\] > header/

/** The card transform rules must exclude the minimized one-line card. */
const CARD_NOT_MIN = /\[data-question-key\] \[class\*="_card"\]:not\(\[class\*="_cardMinimized"\]\)/

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
  // Ask card without failing any geometry test. 0.1.7 removed the <header>
  // element (seat children are div.titleRow + div.tabs), so row rules anchor
  // on `> div...` now — the invariant is the SEAT, not the element: a rule
  // is safe iff it carries [data-slot="conversation.session.header"] as an
  // ancestor and names no bare `header` element of its own.
  const block = layout.slice(layout.indexOf('--- Session header on mobile ---'))
  const selectors = block.split('\n').filter(line => /header\b/.test(line) && line.trim().endsWith('{'))
  assert.ok(selectors.length >= 20, `expected the session-header block, saw ${String(selectors.length)} selectors`)
  const compounds = /conversation\.session\.header|_headerActions|_headerUtilities|_headerLeading|_headerCorner|conversation-header-corner/g
  for (const selector of selectors) {
    assert.match(selector, /\[data-slot="conversation\.session\.header"\]/, `seat anchor missing: ${selector.trim()}`)
    // Directly seat-anchored rows (`> header` on ≤0.1.6, `> div...` on 0.1.7+)
    // cannot leak by construction.
    if (/conversation\.session\.header"\] > (header|div)/.test(selector)) continue
    const stripped = selector.replace(compounds, '')
    assert.doesNotMatch(
      stripped,
      /(^|[\s>+~])header([\s.{:#\[]|$)/,
      `unanchored header element (Ask card leak): ${selector.trim()}`,
    )
  }
})

test('long unbreakable text wraps in every ask-card text family', () => {
  // The card clips horizontally, so a token without a break opportunity is
  // clipped mid-word instead of overflowing visibly. anywhere (not
  // break-word) also lowers the min-content size, which is what lets an
  // option label shrink inside the option row's flex line. The host renders
  // five text families (_title, _optionLabel, _optionCopy, _description,
  // _detail, _reviewNote — all present in the 0.2.2-rc.1 bundle); measured
  // 2026-11-06: an option row without min-width:0 on its label cannot shrink
  // at all inside the flex line.
  for (const family of ['_title', '_optionLabel', '_optionCopy', '_description', '_detail', '_reviewNote']) {
    assert.match(
      composer,
      new RegExp(`\\[data-question-key\\] \\[class\\*="${family}"\\]`),
      `the ${family} wrap rule is missing from composer.css.ts`,
    )
  }
  assert.match(composer, /overflow-wrap: anywhere !important;/)
})

test('a long question scrolls the card instead of clipping its options', () => {
  // The card caps at min(60vh, 520px) and the host delegates scrolling to the
  // option list alone, while the question sits in the fixed header. A question
  // that wraps past the cap therefore spends the whole budget, the option seat
  // computes to zero height and the footer is pushed below the clip — the
  // choices and Submit are unreachable on a phone (mobile report 2026-09-11).
  // The card is also the position context for the absolute action pair, and
  // the minimized one-line card must not become a scrollport. Anchored on a
  // selector line so the fullscreen band rule (which also ends in the same
  // minimized guard but sizes the card instead of scrolling it) is excluded.
  const card = /(^|\n\s*)\[data-question-key\] \[class\*="_card"\]:not\(\[class\*="_cardMinimized"\]\) \{([\s\S]*?)\n\s*\}/.exec(composer)?.[2]
  assert.ok(card, 'the Ask card rule (with the minimized guard) is missing from composer.css.ts')
  assert.match(card, /overflow-y: auto !important;/)
  assert.match(card, /overscroll-behavior-y: contain !important;/)
  assert.match(card, /position: relative !important;/)
})

test('only the card scrolls — the question opens no second scrollport', () => {
  // The 23vh/155px internal title cap opened a second scrollport under the
  // card's: two nested scroll areas on one card read as one seam that always
  // splits mid-line (measured live 2026-11-06: title scrollH 386 in a 155px
  // client while the card scrolled again under it). The card is the single
  // scrollport; the question flows at natural height with the options.
  assert.doesNotMatch(composer, /_title"\][\s\S]{0,400}?max-height:\s*min\(23vh/)
  assert.doesNotMatch(
    composer,
    /\[data-question-key\] \[class\*="_title"\] \{[\s\S]*?overflow-y:\s*auto/,
  )
  // The header stays in the card's flow (it scrolls with it) and never opens
  // its own scroll or clips the action pair parked above it.
  const seat = /(^|\n\s*)\[data-question-key\] \[class\*="_card"\]:not\(\[class\*="_cardMinimized"\]\) > header \{([\s\S]*?)\n\s*\}/.exec(composer)?.[2]
  assert.ok(seat, 'the Ask card in-flow header rule is missing from composer.css.ts')
  assert.match(seat, /flex: 0 0 auto !important;/)
  assert.match(seat, /overflow: visible !important;/)
  assert.doesNotMatch(composer, /\[data-question-scroll\]/)
})

test('the footer is pinned to the card bottom while the body scrolls', () => {
  // A sticky footer keeps Submit and Skip reachable without scrolling even on
  // a card that has spent its height budget (measured live 2026-11-06: the
  // in-flow footer sat 23px past the card's clip edge, feedback row entirely
  // outside). bottom: 0 pins it to the scrollport edge; a card-coloured
  // background plus padding keeps scrolled body text from showing through.
  const footer = /(^|\n\s*)\[data-question-key\] \[class\*="_card"\]:not\(\[class\*="_cardMinimized"\]\) > \[class\*="_footer"\] \{([\s\S]*?)\n\s*\}/.exec(composer)?.[2]
  assert.ok(footer, 'the sticky footer rule is missing from composer.css.ts')
  assert.match(footer, /position: sticky !important;/)
  assert.match(footer, /bottom: 0 !important;/)
  assert.match(footer, /z-index: \d+ !important;/)
  assert.match(footer, /background:/)
})

test('the phone header keeps the icon column clear of the question text', () => {
  // Measured live 2026-11-06 at 390px: the action column is three 24px
  // buttons at a 20px gap (112px wide, left edge x=217), and the eyebrow's
  // 56px reserve left its range x=50..339 running through all three 44px hit
  // boxes — long eyebrow text was painted under the buttons and first tap
  // landed on an icon instead of the text. The reserve must clear the whole
  // column with the 44px hit boxes included.
  assert.match(composer, /\[data-question-key\] \[class\*="_eyebrow"\] \{\s*\n\s*padding-right: 120px !important;/)
  // The heading block spans the full card width beside nothing: the action
  // pair is absolute (out of flow) in the phone tier.
  assert.match(composer, /\[data-question-key\] \[class\*="_headingBlock"\] \{\s*\n\s*flex: 1 1 100% !important;/)
  assert.match(composer, /\[data-question-key\] \[class\*="_card"\]:not\(\[class\*="_cardMinimized"\]\) > header \{\s*\n\s*display: block !important;/)
})

test('phone-only card geometry stays inside the phone tier', () => {
  // The full-open question, the absolute header surgery and the 15px/23px
  // type are phone-tier decisions; 768-1023 touch keeps the host layout with
  // only the touch-target floor (upstream convention: geometry not same-tier
  // across devices).
  const start = composer.indexOf('@media (max-width: 767px)')
  assert.ok(start > 0, 'the nested phone-tier media block is missing from composer.css.ts')
  const end = composer.indexOf('/* Composer status bar', start)
  const phone = composer.slice(start, end)
  assert.match(phone, /\[data-question-key\] \[class\*="_eyebrow"\]/)
  assert.match(phone, /\[data-question-key\] \[class\*="_title"\]/)
})

test('the title type matches the host mobile body measure', () => {
  assert.match(composer, /font-size: 15px !important;\n\s*line-height: 23px !important;/)
})

test('the frame padding rule matches the element that carries the marker', () => {
  // The frame owns data-question-key itself, so the descendant form
  // `[data-question-key] [class*="_frame"]` matched nothing (measured
  // 2026-11-06: the host's 16px side clearance applied, our 12px never did).
  assert.match(composer, /\[data-question-key\]\[class\*="_frame"\]/)
  assert.doesNotMatch(composer, /\[data-question-key\]\s+\[class\*="_frame"\]/)
})

test('the iOS zoom guard targets the current answer-field classes', () => {
  // Upstream renamed the answer stack to .field / .fieldInput / .fieldMirror;
  // the guard kept matching the dead .customInput / .customTextarea names, so
  // iOS Safari zoomed the whole viewport on focus. The mirror sizes the
  // auto-grown field, so it must carry the same 16px as the textarea. The
  // floor now lives once in misc.css.ts, gated on html[data-mobile-nav-ios] so
  // only the engine that zooms pays for it.
  assert.match(
    misc,
    /html\[data-mobile-nav-ios\] \[data-question-key\] \[class\*="_fieldMirror"\]/,
  )
  assert.match(
    misc,
    /html\[data-mobile-nav-ios\] textarea,/,
  )
  assert.doesNotMatch(composer + misc, /_customInput|_customTextarea/)
})

test('the ask body pins the horizontal axis so long tokens cannot drag it', () => {
  assert.match(composer, /\[data-question-key\] \[class\*="_body"\][\s\S]*?overflow-x:\s*hidden/)
})

test('the ask header actions keep 44px touch spacing in the phone tier', () => {
  assert.match(composer, /\[data-question-key\] \[class\*="_headerActions"\][\s\S]*?gap:\s*20px/)
})

test('the injected expand button carries no default button chrome', () => {
  // The injected button gets no host class, so the browser default face,
  // border and padding painted around its glyph beside the host's bare icon
  // buttons and read as a misplaced third button (live report 2026-11-06).
  const expand = /\[data-question-key\] \[data-mobile-nav="question-expand"\] \{([\s\S]*?)\n  \}/.exec(composer)?.[1]
  assert.ok(expand, 'the expand button reset rule is missing from composer.css.ts')
  assert.match(expand, /padding: 0 !important;/)
  assert.match(expand, /border: 0 !important;/)
  assert.match(expand, /background: none !important;/)
  assert.match(expand, /color: inherit !important;/)
})

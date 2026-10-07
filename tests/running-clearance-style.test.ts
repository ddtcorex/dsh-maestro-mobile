import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const layout = readFileSync(new URL('../src/client/styles/layout.css.ts', import.meta.url), 'utf8')

test('the running status keeps clear of the sticky composer on phones', () => {
  // The sticky composer seat (bottom: 0, z-index 7) paints over the last
  // transcript pixels whenever the follow-tail scroll lands even a few px
  // short — e.g. the seat grows after the scroll (stats line, safe-area) or
  // the iOS viewport shifts. Measured on a phone: the "Deep diving for 7s"
  // line sat half under the composer card. Padding inside the running row
  // lifts its text above that danger zone; only the running row is touched,
  // so idle transcripts keep their exact spacing.
  assert.match(
    layout,
    /\[data-chat-running\]\s*\{[^}]*padding-bottom:\s*12px\s*!important;/s,
  )
})

test('the running divider stays put so the status never jumps on phones', () => {
  // Upstream shows the hairline above the status only when the previous
  // transcript row holds output (ChatView.module.css conditional display on
  // .runningDivider, default display:none). Each tool-call switch flips that
  // condition, so the row grows/shrinks ~18.5px and the "Deep diving" text
  // visibly jumps. Pinning the divider always visible keeps the row height
  // identical in both states by construction — no magic numbers to drift
  // when upstream retunes its metrics. Structural selector (no hashed
  // class): RunningStatus.tsx renders exactly three spans — screen-reader
  // status, divider, content — so the divider is the second span.
  assert.match(
    layout,
    /\[data-chat-running\] > span:nth-of-type\(2\)\s*\{[^}]*display:\s*block\s*!important;/s,
  )
})

test('the running row is glued above the composer so follow corrections never move it', () => {
  // The outer transcript follows growth with instant scrollTop corrections
  // (ScrollFollow.jump). On iOS those land through the compositor with
  // visible stepping, so the pinned status line bounces against the
  // composer on every tool-call burst — the stretch observed below the
  // text, hands-free. A bottom-sticky row at the live composer height
  // (ConversationContent publishes --dsh-composer-height on the scrollport;
  // 152px is upstream's own fallback) stays glued while corrections land
  // instead of riding them. At rest its natural spot sits 16px above the
  // stuck line, so the rule is a no-op until a lag frame needs it; scrolled
  // up reading never engages it either.
  assert.match(
    layout,
    /\[data-chat-running\]\s*\{[^}]*position:\s*sticky\s*!important;/s,
  )
  assert.match(
    layout,
    /\[data-chat-running\]\s*\{[^}]*bottom:\s*var\(--dsh-composer-height,\s*152px\)\s*!important;/s,
  )
})

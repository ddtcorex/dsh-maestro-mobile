import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const layout = readFileSync(new URL('../src/client/styles/layout.css.ts', import.meta.url), 'utf8')
const footer = readFileSync(new URL('../src/client/components/MobileDrawerFooter.tsx', import.meta.url), 'utf8')

test('the Bento foot card padding sits on the spacing scale', () => {
  // MASTER.md spacing scale: 4 / 6 / 8 / 12 / 16 / 24. The card carried 10px,
  // which is not a step on that scale, so its inner gutters did not line up
  // with the 12px drawer gutters around it.
  const rule = /\[data-mobile-nav="frame"\] \[class\*="_footArea"\] \{([\s\S]*?)\n  \}/.exec(layout)?.[1]
  assert.ok(rule, 'footArea card rule is missing from layout.css.ts')
  assert.match(rule, /padding: 12px !important;/)
})

test('the session-log pill matches the design-system pill height', () => {
  // settings.md declares the pill shape as h36 / r999. The Session log pill
  // shares the Bento foot card with the 42px Settings and Maestro rows, and
  // at h32 it read as a third, unrelated shape. Keep the pill radius and the
  // border, but bring the height and the inline padding (10 -> 12, the same
  // spacing step) onto the design system.
  assert.match(footer, /height: 36,/, 'session-log pill must be 36px tall')
  assert.match(footer, /padding: '0 12px'/, 'session-log pill must use the 12px spacing step')
  assert.match(footer, /borderRadius: 999/, 'session-log pill keeps the pill radius')
})

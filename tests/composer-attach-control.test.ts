import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const attach = readFileSync(new URL('../src/client/components/MobileComposerAttach.tsx', import.meta.url), 'utf8')
const index = readFileSync(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
const misc = readFileSync(new URL('../src/client/styles/misc.css.ts', import.meta.url), 'utf8')
const composer = readFileSync(new URL('../src/client/styles/composer.css.ts', import.meta.url), 'utf8')

test('the attachment entry fills the empty composer input.left seat', () => {
  // Upstream declares `conversation.input.left` ("compact controls at the left
  // of the composer tool row") and renders the seat right after the permission
  // selector, but ships no contributor — so the file picker is only reachable
  // two taps deep behind the "+" menu.
  assert.match(
    index,
    /ctx\.slots\.inject\('conversation\.input\.left',[\s\S]*?name: 'conversation\.input\.left',[\s\S]*?id: 'mobile-composer-attach'/,
  )
})

test('the attachment entry forwards to upstream own file input', () => {
  // No intake logic is reimplemented: the button clicks the hidden
  // input[type=file] upstream renders inside the composer card, so the accept
  // list, multi-select flag, image limits and upload transaction stay upstream's.
  assert.match(attach, /\[data-composer-card\] input\[type="file"\], \[data-composer-seat\] input\[type="file"\]/)
  assert.match(attach, /input\?\.click\(\)/)
  assert.match(attach, /data-mobile-nav="attach"/)
  assert.match(attach, /IconPaperclipOutline16/)
})

test('the attachment entry is part of the desktop no-op', () => {
  const block = /@media \(min-width: 1024px\) \{([\s\S]*?)\n\}/.exec(misc)?.[1]
  assert.ok(block, 'desktop no-op block is missing from misc.css.ts')
  assert.match(block, /\[data-mobile-nav="attach"\]/)
})

test('the attachment entry is a bare icon button, not a filled pill', () => {
  // No fill and no border: the control should read as an icon in the tool row,
  // matching the ghost pattern upstream uses for its own icon buttons. The
  // hover fill is the only affordance.
  const rule = /\[data-mobile-nav="attach"\] \{([\s\S]*?)\n  \}/.exec(composer)?.[1]
  assert.ok(rule, 'attach rule is missing from composer.css.ts')
  assert.match(rule, /width: 28px !important;/)
  assert.match(rule, /height: 28px !important;/)
  assert.match(rule, /flex: 0 0 auto !important;/)
  assert.match(rule, /background: transparent !important;/)
  assert.match(rule, /border: 0 !important;/)
  assert.doesNotMatch(rule, /background: var\(/)
  const hover = /\[data-mobile-nav="attach"\]:hover \{([\s\S]*?)\n  \}/.exec(composer)?.[1]
  assert.ok(hover, 'attach hover rule is missing')
  assert.match(hover, /background: var\(--dsw-alias-interactive-bg-hover/)
})

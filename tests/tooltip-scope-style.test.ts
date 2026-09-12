import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'

const stylesDir = new URL('../src/client/styles/', import.meta.url)
const files = readdirSync(stylesDir).filter((name) => name.endsWith('.css.ts'))

test('tooltip suppression is scoped to the conversation phase', () => {
  const composer = readFileSync(new URL('composer.css.ts', stylesDir), 'utf8')
  // The rule exists because "Stop generating" lingers mid-screen after a tap
  // on mobile. An unscoped [role="tooltip"] rule also hid tooltips owned by
  // other plugins (market, dashboard, third-party panels) on any phone.
  const rule = /@media \(hover: none\), \(pointer: coarse\) \{([\s\S]*?)\n  \}/.exec(composer)?.[1]
  assert.ok(rule, 'the touch-gated tooltip block is missing from composer.css.ts')
  assert.match(rule, /\[data-phase\] \[role="tooltip"\]/)
  assert.match(rule, /display: none !important;/)
})

test('no stylesheet hides tooltips without the conversation-phase scope', () => {
  for (const file of files) {
    // Comments explain the rule and may quote a selector; only real rules count.
    const css = readFileSync(new URL(file, stylesDir), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    for (const [, selector] of css.matchAll(/([^{}]*)\{[^}]*display: none !important;/g)) {
      if (!selector.includes('tooltip')) continue
      assert.match(selector, /\[data-phase\]/, `${file}: "${selector.trim()}" must be scoped to [data-phase]`)
    }
  }
})

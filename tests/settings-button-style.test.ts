import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const layout = readFileSync(new URL('../src/client/styles/layout.css.ts', import.meta.url), 'utf8')

test('the drawer settings control fills its mobile gutter and centers its label', () => {
  assert.match(
    layout,
    /\[data-mobile-nav="frame"\] \[class\*="_settingsArea"\]\s*\{[^}]*padding-inline:\s*0\s*!important;[^}]*width:\s*100%\s*!important;[^}]*box-sizing:\s*border-box\s*!important;/s,
  )
  assert.match(
    layout,
    /\[data-mobile-nav="frame"\] \[class\*="_settingsArea"\] button\s*\{[^}]*width:\s*100%\s*!important;[^}]*justify-content:\s*center\s*!important;[^}]*margin-inline:\s*0\s*!important;[^}]*padding-inline:\s*0\s*!important;/s,
  )
})

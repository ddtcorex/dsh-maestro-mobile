import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COMPAT_CSS } from '../src/client/styles/compat.css.ts'

test('installed-list styling excludes nested action rows', () => {
  assert.match(COMPAT_CSS, /\[class\*="irow"\]:not\(\[class\*="irowActions"\]\):not\(\[class\*="irowTrailing"\]\)/)
})

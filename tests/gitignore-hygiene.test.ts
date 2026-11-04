import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const ignore = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8')

// 2026-11-04: the build-output rule was a bare `lib/`, which git matches at any
// depth. A build-time module placed in `scripts/lib/` was therefore never
// committed, `git status` reported a clean tree, and the loss only surfaced in
// the sandboxed CI rehearse clone (ERR_MODULE_NOT_FOUND on the import). The
// rule must stay anchored to the repo root.

test('the build-output ignore is anchored to the repo root', () => {
  assert.match(ignore, /^\/lib\/$/m, 'the lib ignore must be /lib/, not lib/')
})

test('no ignore rule matches a nested lib directory', () => {
  const lines = ignore
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
  const nested = lines.filter((line) => /^!?(\*\*\/|\*\/)?lib\/?$/u.test(line) && !line.includes('/lib/'))
  assert.deepEqual(nested, [], `a bare lib rule still swallows nested paths: ${nested.join(', ')}`)
})

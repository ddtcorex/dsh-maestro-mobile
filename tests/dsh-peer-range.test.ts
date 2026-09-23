import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

/**
 * Guards the DSH peer contract (spec docs/specs/2026-09-23-dsh-maestro-peer-compat-design.md).
 * See the sibling packages' `dsh-peer-range` test for the full rationale; this file is the
 * `node --test` variant, since this package does not use vitest.
 */
const here = dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(readFileSync(resolve(here, '../package.json'), 'utf8')) as {
  peerDependencies?: Record<string, string>
}

const NORMALIZED = '>=0.1.6-alpha.2 <0.2.0-0'
const FORBIDDEN_PEER_PREFIX = '@deepseek-ai/dsh'

function dshPeers(): Array<[string, string]> {
  return Object.entries(manifest.peerDependencies ?? {}).filter(
    ([name]) => name === FORBIDDEN_PEER_PREFIX || name.startsWith(`${FORBIDDEN_PEER_PREFIX}-`),
  )
}

function violations(): string[] {
  const found: string[] = []
  for (const [name, range] of dshPeers()) {
    const reasons: string[] = []
    if (/^\d/.test(range.trim())) reasons.push('exact pin')
    if (!/<\s*0\.\d/.test(range)) reasons.push('missing ceiling')
    else if (!/0\.2\.0-0/.test(range)) reasons.push('ceiling lacks -0 suffix')
    const earlyFloor = /(?:>=|\^|~)?\s*0\.1\.\d/.test(range)
    if (!earlyFloor) reasons.push('floor too late')
    if (reasons.length > 0) found.push(`${name}: ${reasons.join(', ')}`)
  }
  return found
}

test('declares at least one dsh peer (sanity: the guard would be vacuous otherwise)', () => {
  assert.ok(dshPeers().length > 0)
})

test('uses the normalized range for every dsh peer', () => {
  for (const [name, range] of dshPeers()) assert.equal(range, NORMALIZED, name)
})

test('reports no structural violations', () => {
  assert.deepEqual(violations(), [])
})

test('flags an exact pin (the 2026-09-23 incident)', () => {
  assert.equal(/^\d/.test('0.1.7-alpha.2'), true)
})

test('flags a ceiling that lacks the -0 suffix', () => {
  assert.equal(/0\.2\.0-0/.test('^0.1.0-rc.6 || >=0.1.1-rc.0 <0.2.0'), false)
  assert.equal(/0\.2\.0-0/.test(NORMALIZED), true)
})

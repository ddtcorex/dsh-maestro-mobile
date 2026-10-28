import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import semver from 'semver'

/**
 * Guards the DSH peer contract by SATISFIABILITY, not by string shape.
 *
 * The previous version of this test asserted the literal range
 * `>=0.2.0-rc.2 <0.3.0-0` and nothing else, which is how the plugin shipped a
 * range that rejects the host it runs on: semver only admits a prerelease when
 * a comparator names that exact `[major, minor, patch]` tuple, so
 * `0.2.2-alpha.2` did NOT satisfy `>=0.2.0-rc.2 <0.3.0-0` (verified with semver
 * 7.8.5 against the running install), and `4.0.6-alpha.1` did not satisfy
 * `~4.0.4`. A registry install of the package reported unmet peers while the
 * host it was written for satisfied neither range.
 *
 * Keep both checks: the shape (one shared range, ceiling present) and the
 * behaviour (the release in use satisfies it). Bump `HOST_RELEASE_UNDER_TEST`
 * with every host upgrade; `DSH_HOST_VERSION` lets CI prove the same claim for
 * another release without editing the file.
 */
const here = dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(readFileSync(resolve(here, '../package.json'), 'utf8')) as {
  peerDependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

/** The DSH release this checkout is verified against. */
const HOST_RELEASE_UNDER_TEST = '0.2.2-alpha.2'

/** The cordis build the host ships (a runtime peer, not a dsh package). */
const CORDIS_RELEASE_UNDER_TEST = '4.0.6-alpha.1'

/** The range every `@deepseek-ai/dsh-*` peer must declare. */
const DSH_PEER_RANGE = '>=0.2.0-rc.2 <0.3.0-0 || >=0.2.2-0 <0.3.0-0'

function dshPeers(): Array<[string, string]> {
  return Object.entries(manifest.peerDependencies ?? {}).filter(
    ([name]) => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-'),
  )
}

test('declares at least one dsh peer (sanity: the guard would be vacuous otherwise)', () => {
  assert.ok(dshPeers().length > 0)
})

test('every dsh peer declares the same range and keeps a 0.3 ceiling', () => {
  for (const [name, range] of dshPeers()) {
    assert.equal(range, DSH_PEER_RANGE, name)
    assert.match(range, /<\s*0\.3\.0-0/, `${name} must keep the 0.3 ceiling with the -0 suffix`)
  }
})

test('the range accepts the DSH release this plugin runs on', () => {
  for (const [name, range] of dshPeers()) {
    assert.equal(
      semver.satisfies(HOST_RELEASE_UNDER_TEST, range),
      true,
      `${name}: ${HOST_RELEASE_UNDER_TEST} must satisfy ${range}`,
    )
  }
})

test('the range accepts the same line and refuses the next minor line', () => {
  for (const [name, range] of dshPeers()) {
    assert.equal(semver.satisfies('0.2.2', range), true, `${name} must accept 0.2.2`)
    assert.equal(semver.satisfies('0.2.3', range), true, `${name} must accept 0.2.3`)
    assert.equal(semver.satisfies('0.3.0', range), false, `${name} must refuse 0.3.0`)
  }
})

test('the cordis range accepts the build the host ships', () => {
  const range = manifest.peerDependencies?.['@deepseek-ai/cordis']
  assert.ok(range, 'cordis peer must be declared')
  assert.equal(
    semver.satisfies(CORDIS_RELEASE_UNDER_TEST, range),
    true,
    `cordis ${CORDIS_RELEASE_UNDER_TEST} must satisfy ${range}`,
  )
  assert.equal(semver.satisfies('4.0.4', range), true, 'the older cordis build stays supported')
})

test('the installed host version, when the environment names one, is accepted', (t) => {
  const fromEnv = process.env.DSH_HOST_VERSION?.trim()
  if (!fromEnv) {
    t.diagnostic('DSH_HOST_VERSION not set; the pinned release above is the only host checked')
    return
  }
  for (const [name, range] of dshPeers()) {
    assert.equal(semver.satisfies(fromEnv, range), true, `${name}: ${fromEnv} must satisfy ${range}`)
  }
})

test('the devDependency used for type-checking is not pinned to a rejected release', () => {
  // Leaving this on 0.2.0-rc.2 is how the local type-check silently drifted
  // from the running host (0.2.0-rc.2 types against a 0.2.2-alpha.2 host).
  const range = manifest.devDependencies?.['@deepseek-ai/dsh-client-store']
  assert.ok(range, 'dsh-client-store devDependency must be declared')
  assert.equal(
    semver.satisfies(HOST_RELEASE_UNDER_TEST, range),
    true,
    `dsh-client-store ${HOST_RELEASE_UNDER_TEST} must satisfy ${range}`,
  )
})

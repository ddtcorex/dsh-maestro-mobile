// Syntax gate for the probe battery.
//
// `scripts/**/*.mjs` is this repo's runtime regression battery, and nothing
// compiles it: `pnpm test` globs `tests/*.test.ts` only, and the probes are plain
// .mjs. A quoting error in one of them is therefore invisible until a human runs
// that exact probe, which upstream demonstrated by shipping a swipe probe that
// had been unloadable for weeks after one escaped quote (dsh-web-mobile
// v3.3.5 #282). The same class of break here would take out a probe that only
// fires on a real device.
//
// One child process parses every file with `vm.SourceTextModule`: parsing is what
// `node --check` does, minus one process per file (measured upstream: 0.3 s for
// the whole tree instead of 5.6 s). `vm.SourceTextModule` still needs
// `--experimental-vm-modules`, and `node --test` cannot pass flags to itself,
// hence the child. The checker also parses a known-bad source and reports
// whether it threw: if a Node change ever made the parser lazy, this gate would
// go green forever, and an always-passing assertion is worse than none.

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const CHECKER = `
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import vm from 'node:vm'

const ROOT = ${JSON.stringify(ROOT)}
const files = []
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (entry.name.endsWith('.mjs')) files.push(full)
  }
}
walk(join(ROOT, 'scripts'))

const failures = []
for (const file of files) {
  try {
    new vm.SourceTextModule(readFileSync(file, 'utf8'), { identifier: file })
  } catch (error) {
    failures.push(relative(ROOT, file) + ': ' + error.message)
  }
}

// The parser must reject a known-bad source, or this gate proves nothing.
let selfCheck = false
try {
  new vm.SourceTextModule('export const broken = (', { identifier: 'self-check' })
} catch {
  selfCheck = true
}

process.stdout.write(JSON.stringify({ files: files.length, failures, selfCheck }))
`

test('every probe script parses', () => {
  const run = spawnSync(
    process.execPath,
    ['--experimental-vm-modules', '--input-type=module', '-e', CHECKER],
    { encoding: 'utf8', timeout: 30_000 },
  )
  assert.equal(run.status, 0, `the parse pass did not run: ${run.stderr.trim()}`)
  const report = JSON.parse(run.stdout)
  // A walk that finds nothing would pass every assertion below, so pin a floor.
  assert.ok(report.files >= 10, `only ${report.files} probe files found under scripts/`)
  assert.equal(report.selfCheck, true, 'the parser no longer rejects a broken source, so this gate is vacuous')
  assert.deepEqual(report.failures, [], `unparsable probe scripts:\n${report.failures.join('\n')}`)
})

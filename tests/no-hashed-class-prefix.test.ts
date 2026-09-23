import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const CLIENT_ROOT = fileURLToPath(new URL('../src/client', import.meta.url))

/** Every .ts/.tsx module under src/client, recursively. */
function clientSources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = `${dir}/${entry}`
    if (statSync(path).isDirectory()) clientSources(path, found)
    else if (path.endsWith('.ts') || path.endsWith('.tsx')) found.push(path)
  }
  return found
}

test('no client selector names an upstream CSS-module hash prefix', () => {
  // A CSS-module class is `<6-char build hash>_<localName>`, so a selector built
  // from the hash dies on the next build while every marker, media query and
  // stylesheet assertion still passes. That is how the lineage chip's
  // synthetic-hover swallow stopped firing (ZKlsPq/h8S2Va matched nothing on
  // 0.1.7, measured live). Substring fragments without the hash — the sanctioned
  // form, `[class*="_trigger"]` — are deliberately not matched here.
  const hashPrefix = /class\*=\s*["'][A-Za-z0-9_-]{6}_/
  const offenders = clientSources(CLIENT_ROOT)
    // Comment text is not a selector (docs/maintenance/pitfalls.md).
    .map(path => ({
      path,
      code: readFileSync(path, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^[ \t]*\/\/.*$/gm, ''),
    }))
    .filter(({ code }) => hashPrefix.test(code))
    .map(({ path }) => path.slice(path.indexOf('/src/')))
  assert.deepEqual(offenders, [])
})

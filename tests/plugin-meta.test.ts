// The plugin manager reads a plugin's display text and artwork WITHOUT running
// it: `dsh-app-boot` resolves `<pkg>/locale/en.json` and `<pkg>/icon` through the
// Node resolver, so both are packaging contracts, not cosmetics. Get one wrong and
// the installed card silently degrades to the bare package name with no artwork,
// which is exactly how this plugin looked next to its neighbours.
//
// The rules below are copied from the host's reader, not invented here:
// - the icon is a manifest field naming a path RELATIVE to the package, inside
//   the package, with an SVG/PNG/JPEG/WebP extension, at most 256 KiB, or an
//   exported `./icon`;
// - every locale file is resolved as `<pkg>/locale/<language>.json`, so the
//   subpath has to be exported; the file names must be language ids and share
//   the English file's directory;
// - display text lives under `meta.title` / `meta.description`.
// tests/plugin-meta.test.ts fails when any of that stops holding.

import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const ICON_MEDIA_TYPES = new Map([
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
])

test('the manifest declares a card icon the host can read', () => {
  const icon = manifest.icon
  assert.equal(typeof icon, 'string', 'package.json has no icon field')
  assert.ok(icon.trim() !== '')
  // The host rejects absolute paths and URIs outright.
  assert.ok(!isAbsolute(icon), `icon must be relative, got ${icon}`)
  assert.doesNotMatch(icon, /^[A-Za-z][A-Za-z\d+.-]*:/, `icon must not be a URI, got ${icon}`)
  const target = resolve(ROOT, icon)
  // The host refuses an icon outside the manifest directory.
  const inside = relative(ROOT, target)
  assert.ok(!inside.startsWith(`..${sep}`) && inside !== '..', `icon escapes the package: ${icon}`)
  const mediaType = ICON_MEDIA_TYPES.get(icon.slice(icon.lastIndexOf('.')))
  assert.ok(mediaType !== undefined, `icon must be SVG, PNG, JPEG or WebP, got ${icon}`)
  const stats = statSync(target)
  assert.ok(stats.isFile(), `icon is not a regular file: ${icon}`)
  assert.ok(stats.size <= 256 * 1024, `icon exceeds 256 KiB (${stats.size} bytes)`)
})

test('the icon ships in the published package', () => {
  // `files` decides what npm publishes; a metadata file outside it works from a
  // local checkout and vanishes for every installed copy.
  for (const needed of ['assets', 'locale']) {
    assert.ok(manifest.files.includes(needed), `files must include ${needed}`)
  }
})

test('the locale subpath is exported, so the host resolver can reach it', () => {
  // The host resolves `<pkg>/locale/en.json` through the ESM resolver: a missing
  // export is ERR_PACKAGE_PATH_NOT_EXPORTED, which it treats as "no metadata".
  assert.equal(manifest.exports['./locale/*.json'], './locale/*.json')
})

test('every locale file is a language id and carries both display fields', () => {
  const dir = join(ROOT, 'locale')
  const files = readdirSync(dir).filter(name => name.endsWith('.json'))
  // en.json is the file the host resolves first; without it there is no metadata
  // at all, whatever else the directory holds.
  assert.ok(files.includes('en.json'), 'locale/en.json is missing')
  for (const name of files) {
    // The host derives the language from the filename and rejects anything that
    // is not a language id (LANGUAGE_ID in dsh-app-boot).
    assert.match(name.slice(0, -5), /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/, `${name}: not a language id`)
    const parsed = JSON.parse(readFileSync(join(dir, name), 'utf8'))
    for (const field of ['title', 'description']) {
      const value = parsed.meta?.[field]
      assert.equal(typeof value, 'string', `${name}: meta.${field} must be a string`)
      assert.ok(value.trim() !== '', `${name}: meta.${field} must not be empty`)
    }
  }
})

import { strict as assert } from 'node:assert'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

/**
 * The mobile drawer used to carry its own Session log button. DSH now serves
 * "Download session log" in the session header's context menu, which this plugin
 * surfaces on phones already, so the drawer copy is duplicated UI.
 *
 * Measured on 0.2.3-alpha.2 at 390px, opening the session header menu:
 * ["Copy Session as Markdown", "Download session log", "Open in", "Feedback"].
 *
 * Removing the footer must also remove what only existed to serve it: the
 * `sidebar.footer.action` registration, the `sessionLogDownload` client
 * injection, the download glyph and its locale key. Each of those is a live
 * dependency on a host service or primitive, so leaving one behind keeps dead
 * weight wired into the plugin's inject list.
 */
const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

function sources(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) found.push(...sources(path))
    else if (path.endsWith('.ts') || path.endsWith('.tsx')) found.push(path)
  }
  return found
}

function read(relative: string): string {
  return readFileSync(join(root, relative), 'utf8')
}

test('no component renders a drawer session-log action', () => {
  const offenders: string[] = []
  for (const path of sources(join(root, 'src/client'))) {
    if (readFileSync(path, 'utf8').includes('data-mobile-nav="session-log"')) offenders.push(path.replace(`${root}/`, ''))
  }
  assert.deepEqual(offenders, [], 'the drawer session-log action must be gone')
})

test('the client no longer registers a sidebar footer action', () => {
  const index = read('src/client/index.tsx')
  assert.equal(index.includes('sidebar.footer.action'), false, 'no sidebar.footer.action registration may remain')
  assert.equal(index.includes('MobileDrawerFooter'), false, 'the footer component must not be imported or registered')
})

test('the client no longer injects the sessionLogDownload service', () => {
  const index = read('src/client/index.tsx')
  assert.equal(index.includes('sessionLogDownload'), false, 'sessionLogDownload must leave the inject list and its typing import')
})

test('the download glyph and its locale key are gone', () => {
  assert.equal(read('src/client/core/icon-compat.ts').includes('IconDownload'), false, 'the download glyph has no other consumer')
  assert.equal(read('src/client/core/icon-pick.ts').includes('DOWNLOAD_ICON_NAMES'), false, 'the download icon names have no other consumer')
  assert.equal(read('src/client/i18n/locales.ts').includes('sessionLog'), false, 'the sessionLog locale key has no other consumer')
})

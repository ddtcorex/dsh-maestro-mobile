import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { MOBILE_CSS } from '../src/client/styles/index.ts'
import { LAYOUT_CSS } from '../src/client/styles/layout.css.ts'

/**
 * Trailing-lane seat guard: the upstream v3.0.5 third-party seat fix, ported
 * as a playbook rather than as selectors.
 *
 * Upstream issue (mexiaosqwq/dsh-web-mobile#60, @hytime/dsh-thinking-effort):
 * a model seat registered on conversation.input.model replaces the official
 * pill, so in its open state the seat root collapses to zero width (its only
 * child is the absolutely positioned panel) while the panel stays anchored
 * to that root — right:0 sweeps 336px leftward off screen, an inline left
 * from the plugin's own narrow-screen clamp beats the stylesheet, and a
 * stale translateX shifts it further. Their recipe, in order:
 *   1. stretch the seat root across the lane (flex:1 1 auto, content right,
 *      position:static so the root never becomes the containing block), with
 *      the stretch written AFTER the lane's generic flex:none root rule so
 *      the cascade resolves to it;
 *   2. card-anchor the open panel (left:0/right:0 + auto margins,
 *      transform:none, !important to beat the inline left);
 *   3. three viewport guards (short-screen listbox, keyboard-shrunk phone,
 *      landscape sheet).
 *
 * None of it is copied here because the selectors would be dead: this
 * codebase carries no [data-seat-root]/[data-seat-panel] markers (pinned
 * below), and none of our trailing-lane chips mounts an absolutely
 * positioned panel on a collapsible root —
 *   - the composer trailing lane (model trigger, meter, send) is pure flex
 *     shrink with no positioning at all (pinned below);
 *   - the background-job popover was already re-docked with position:fixed
 *     and viewport-clamped edges after the same class of bug rendered it
 *     below the viewport (pinned below);
 *   - the lineage catalog and the "+" command menu are host-positioned
 *     (body portal / host Menu), so there is no plugin anchor to re-anchor.
 * If a third-party seat ever lands in this DOM, apply the recipe above to
 * its real markers instead of reviving the upstream selectors blind.
 */

const CLIENT_ROOT = fileURLToPath(new URL('../src/client', import.meta.url))

/** Every .ts/.tsx module under src/client, recursively, comments stripped. */
function clientSources(): { path: string; code: string }[] {
  const found: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = `${dir}/${entry}`
      if (statSync(path).isDirectory()) walk(path)
      else if (path.endsWith('.ts') || path.endsWith('.tsx')) found.push(path)
    }
  }
  walk(CLIENT_ROOT)
  return found.map((path) => ({
    path: path.slice(path.indexOf('/src/')),
    code: readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, ''),
  }))
}

/** Body of the phone-tier media block (brace-walked, so nested at-rules are kept). */
function phoneBlock(css: string): string {
  const start = css.indexOf('@media (max-width: 1023px) and (pointer: coarse) {')
  assert.ok(start >= 0, 'phone-tier media block present')
  let depth = 0
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) return css.slice(css.indexOf('{', start) + 1, i)
  }
  return css.slice(start)
}

test('no dead third-party seat selectors ship in this codebase', () => {
  // Upstream's exact [data-seat-root]/[data-seat-panel] markers do not exist
  // in our DOM: copying their rules would style nothing while passing every
  // text assertion. If a seat plugin is ever adopted, its real markers must
  // replace these, not join them.
  const offenders = clientSources()
    .filter(({ code }) => code.includes('[data-seat-'))
    .map(({ path }) => path)
  assert.deepEqual(offenders, [])
})

test('the composer trailing lane carries no positioning to collapse under', () => {
  // The bug class needs an absolutely positioned panel on a zero-width root.
  // The composer-row section holds only flex shrink/ellipsis rules, so no
  // panel can ride a collapsed root by construction.
  const section = LAYOUT_CSS.slice(
    LAYOUT_CSS.indexOf('/* --- Composer bottom row on mobile ---'),
    LAYOUT_CSS.indexOf('/* --- Session header on mobile ---'),
  ).replace(/\/\*[\s\S]*?\*\//g, '')
  assert.ok(section.length > 0, 'composer-row section markers present')
  assert.doesNotMatch(section, /position\s*:/)
})

test('the docked job popover stays in-viewport by fixed positioning', () => {
  // Same bug class, already fixed differently: fixed positioning ignores the
  // lost static root and the overflow:hidden ancestors, with viewport edges.
  const phone = phoneBlock(MOBILE_CSS)
  const at = phone.indexOf('[data-mobile-nav="jobs"]) > ul[class*="_menu"] {')
  assert.ok(at !== -1, 'jobs dock rule present')
  const block = phone.slice(at, phone.indexOf('}', at))
  assert.match(block, /position:\s*fixed !important/)
  assert.match(block, /left:\s*8px !important/)
  assert.match(block, /right:\s*8px !important/)
})

test('generic header popovers are clamped to the viewport width', () => {
  const phone = phoneBlock(MOBILE_CSS)
  const at = phone.indexOf('[data-slot="conversation.session.header"] ul[class*="_menu"] {')
  assert.ok(at !== -1, 'header popover clamp present')
  const block = phone.slice(at, phone.indexOf('}', at))
  assert.match(block, /width:\s*min\(336px, calc\(100vw - 16px\)\)/)
})

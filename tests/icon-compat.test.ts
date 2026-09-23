import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  DOWNLOAD_ICON_NAMES,
  MISSING_ICON,
  PANEL_LEFT_ICON_NAMES,
  pickIcon,
  type HostIcon,
} from '../src/client/core/icon-pick.ts'

const component: HostIcon = () => null

test('the first candidate the host exports wins', () => {
  const table = {
    IconPanelLeftOutlineMedium: component,
    IconPanelLeftOutlineRegular: component,
  }
  assert.equal(pickIcon(PANEL_LEFT_ICON_NAMES, table), component)
})

test('a host from the other generation still resolves', () => {
  // 0.1.0-rc line: only the size-named export exists.
  const rc = { IconPanelLeftOutline16: component }
  assert.equal(pickIcon(PANEL_LEFT_ICON_NAMES, rc), component)
  // 0.1.7 line without the emphasized weight.
  const regular = { IconPanelLeftOutlineRegular: component }
  assert.equal(pickIcon(PANEL_LEFT_ICON_NAMES, regular), component)
})

test('a name nothing matches renders nothing instead of crashing the tree', () => {
  assert.equal(pickIcon(PANEL_LEFT_ICON_NAMES, {}), MISSING_ICON)
  assert.equal(pickIcon(PANEL_LEFT_ICON_NAMES, { IconPanelLeftOutlineMedium: 'nope' }), MISSING_ICON)
  assert.equal(MISSING_ICON({ size: 16 }), null)
})

test('the candidate lists cover both host naming generations', () => {
  for (const names of [PANEL_LEFT_ICON_NAMES, DOWNLOAD_ICON_NAMES]) {
    assert.ok(names.some((name) => name.endsWith('Regular')), `${names[0]} needs a 0.1.7 name`)
    assert.ok(names.some((name) => name.endsWith('16')), `${names[0]} needs an rc-era name`)
    // The emphasized weight we already render on 0.1.7 stays first, so this
    // change cannot alter the visual result on the host it ships against.
    assert.ok(names[0]?.endsWith('Medium'), `${names[0]} must keep Medium first`)
  }
})

test('no component imports a host icon by name any more', () => {
  // The regression this guards: a static named import resolving to undefined on
  // the other generation, which React reports as "Element type is invalid" for
  // the whole plugin tree.
  for (const file of ['MobileNavToggle.tsx', 'MobileDrawerFooter.tsx']) {
    const source = readFileSync(new URL(`../src/client/components/${file}`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /from '@deepseek-ai\/dsh-client-ui-primitives'/, `${file} must use icon-compat`)
    assert.match(source, /from '\.\.\/core\/icon-compat\.ts'/)
  }
})

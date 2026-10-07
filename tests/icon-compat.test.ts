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

test('the candidate the host exports wins', () => {
  const table = { IconPanelLeftOutlineMedium: component }
  assert.equal(pickIcon(PANEL_LEFT_ICON_NAMES, table), component)
})

test('a name nothing matches renders nothing instead of crashing the tree', () => {
  assert.equal(pickIcon(PANEL_LEFT_ICON_NAMES, {}), MISSING_ICON)
  assert.equal(pickIcon(PANEL_LEFT_ICON_NAMES, { IconPanelLeftOutlineMedium: 'nope' }), MISSING_ICON)
  assert.equal(MISSING_ICON({ size: 16 }), null)
})

test('the candidates name the emphasized weight the host exports', () => {
  assert.deepEqual(PANEL_LEFT_ICON_NAMES, ['IconPanelLeftOutlineMedium'])
  assert.deepEqual(DOWNLOAD_ICON_NAMES, ['IconDownloadOutlineMedium'])
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

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  PANEL_ROW_SELECTOR,
  isActivePanelRow,
  panelSelectorOf,
  shouldArmBackEntry,
  shouldReleaseBackEntry,
} from '../src/client/effects/panel-exit.ts'

/** Minimal element shape isActivePanelRow reads: closest + getAttribute. */
class FakeRow {
  private readonly current: string | null

  constructor(current: string | null) {
    this.current = current
  }

  getAttribute(name: string): string | null {
    return name === 'aria-current' ? this.current : null
  }
}

class FakeTarget {
  private readonly row: FakeRow | null

  constructor(row: FakeRow | null) {
    this.row = row
  }

  closest(selector: string): FakeRow | null {
    return selector === PANEL_ROW_SELECTOR ? this.row : null
  }
}

function asElement(target: FakeTarget): Element {
  return target as unknown as Element
}

test('only the SELECTED sidebar panel row counts as the exit target', () => {
  assert.equal(isActivePanelRow(asElement(new FakeTarget(new FakeRow('page')))), true)
  // An unselected row must keep going through the host's own selectPanel(id).
  assert.equal(isActivePanelRow(asElement(new FakeTarget(new FakeRow(null)))), false)
  assert.equal(isActivePanelRow(asElement(new FakeTarget(null))), false)
  assert.equal(isActivePanelRow(null), false)
})

test('a host without a panel-selection face is probed, never assumed', () => {
  // The layout face is capability-checked: rc-generation hosts carry only
  // toggleSidebar/openDetails/closeDetails, so the feature must go inert rather
  // than throw at call time.
  assert.equal(panelSelectorOf({}), null)
  assert.equal(panelSelectorOf({ selectPanel: 42 }), null)
  assert.equal(panelSelectorOf(null), null)
  assert.equal(panelSelectorOf(undefined), null)
})

test('the panel selector calls selectPanel(null) with its own receiver', () => {
  const seen: Array<string | null> = []
  const layout = {
    marker: 'face',
    selectPanel(this: { marker: string }, id: string | null): void {
      seen.push(`${this.marker}:${String(id)}`)
    },
  }
  const select = panelSelectorOf(layout)
  assert.notEqual(select, null)
  select?.()
  assert.deepEqual(seen, ['face:null'])
})

test('the back entry is armed exactly once per panel visit', () => {
  // open + not armed -> arm; already armed -> leave the entry alone.
  assert.equal(shouldArmBackEntry(true, false), true)
  assert.equal(shouldArmBackEntry(true, true), false)
  // No panel -> never arm (the plugin must not touch history otherwise).
  assert.equal(shouldArmBackEntry(false, false), false)
  assert.equal(shouldArmBackEntry(false, true), false)
})

test('the back entry is released when the panel leaves by another route', () => {
  assert.equal(shouldReleaseBackEntry(false, true), true)
  assert.equal(shouldReleaseBackEntry(false, false), false)
  assert.equal(shouldReleaseBackEntry(true, true), false)
  assert.equal(shouldReleaseBackEntry(true, false), false)
})

test('the client entry point installs the panel exit and its back task', () => {
  const entry = readFileSync(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
  assert.match(entry, /createPanelExit\(ctx\.layout\)/)
  assert.match(entry, /installPanelRowExit\(ctx, panelExit\.exit\)/)
  assert.match(entry, /addReconcilerTask\(panelExit\.task\)/)
})

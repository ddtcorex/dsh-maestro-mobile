import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  ADD_BUTTON_SELECTOR,
  EDITOR_SELECTOR,
  isComposerAddButton,
  menuIsVisible,
  shouldCloseCommandMenu,
} from '../src/client/effects/composer-plus-toggle.ts'

/** Element shape the two DOM predicates read: `closest` only. */
type Flags = { add?: boolean; menuTrigger?: boolean; composerCard?: boolean; editor?: boolean }

class FakeElement {
  private readonly flags: Flags
  private readonly parent: FakeElement | null

  constructor(flags: Flags = {}, parent: FakeElement | null = null) {
    this.flags = flags
    this.parent = parent
  }

  /** Single-selector match, no combinators. */
  matchesSimple(selector: string): boolean {
    if (selector === 'button[aria-haspopup="listbox"]') return this.flags.add === true
    if (selector === 'button[aria-haspopup="menu"]') return this.flags.menuTrigger === true
    if (selector === '[data-composer-card]') return this.flags.composerCard === true
    if (selector === EDITOR_SELECTOR) return this.flags.editor === true
    return false
  }

  closestSimple(selector: string): FakeElement | null {
    let element: FakeElement | null = this
    while (element !== null) {
      if (element.matchesSimple(selector)) return element
      element = element.parent
    }
    return null
  }

  closest(selector: string): FakeElement | null {
    // The add button is a compound selector: the popup trigger itself must sit
    // inside the composer capsule, so the scope half is evaluated here too.
    if (selector === ADD_BUTTON_SELECTOR) {
      const trigger = this.closestSimple('button[aria-haspopup="listbox"]')
      if (trigger === null) return null
      return trigger.closestSimple('[data-composer-card]') === null ? null : trigger
    }
    return this.closestSimple(selector)
  }
}

function asElement(element: FakeElement): Element {
  return element as unknown as Element
}

test('detects the composer "+" button through the host popup attributes', () => {
  const card = new FakeElement({ composerCard: true })
  const add = new FakeElement({ add: true }, card)
  assert.equal(isComposerAddButton(asElement(add)), true)
  // The icon inside the button is the real tap target.
  assert.equal(isComposerAddButton(asElement(new FakeElement({}, add))), true)
})

test('does not mistake another composer popup trigger for the add button', () => {
  const card = new FakeElement({ composerCard: true })
  const model = new FakeElement({ menuTrigger: true }, card)
  assert.equal(isComposerAddButton(asElement(model)), false)
})

test('does not treat a listbox trigger outside the composer capsule as the add button', () => {
  const elsewhere = new FakeElement({ add: true })
  assert.equal(isComposerAddButton(asElement(elsewhere)), false)
})

test('a missing target is never the add button', () => {
  assert.equal(isComposerAddButton(null), false)
})

test('a second tap closes the menu only when the host left it open', () => {
  // Open before the host's onClick AND still open after it: track() cleared the
  // launcher, so the host's own close branch was unreachable.
  assert.equal(shouldCloseCommandMenu(true, true), true)
  // First tap (menu closed before) is the opening gesture: never intervene.
  assert.equal(shouldCloseCommandMenu(false, true), false)
  // The host closed it on its own: nothing left to do.
  assert.equal(shouldCloseCommandMenu(true, false), false)
  assert.equal(shouldCloseCommandMenu(false, false), false)
})

test('only a laid-out menu counts as open', () => {
  assert.equal(menuIsVisible({ width: 240, height: 180 }, 1), true)
  // React still holds the node but it is not painted.
  assert.equal(menuIsVisible({ width: 0, height: 0 }, 1), false)
  assert.equal(menuIsVisible({ width: 240, height: 180 }, 0), false)
  assert.equal(menuIsVisible(null, 3), false)
})

test('the effect is installed by the client entry point', () => {
  const entry = readFileSync(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
  assert.match(entry, /installComposerPlusToggle\(ctx\)/)
  assert.match(entry, /from '\.\/effects\/composer-plus-toggle\.ts'/)
})

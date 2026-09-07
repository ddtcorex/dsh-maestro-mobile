import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldSuppressComposerMousedown } from '../src/client/effects/composer-keyboard-touch.ts'

type Flags = { button?: boolean; composerCard?: boolean; triggerMenu?: boolean }

class FakeElement {
  parent: FakeElement | null
  flags: Flags
  constructor(flags: Flags = {}, parent: FakeElement | null = null) {
    this.flags = flags
    this.parent = parent
  }
  matches(sel: string): boolean {
    if (sel === 'button') return this.flags.button === true
    if (sel === '[data-composer-card]') return this.flags.composerCard === true
    if (sel === '[data-trigger-menu]') return this.flags.triggerMenu === true
    return false
  }
  closest(sel: string): FakeElement | null {
    let el: FakeElement | null = this
    while (el !== null) {
      if (el.matches(sel)) return el
      el = el.parent
    }
    return null
  }
}

function asElement(el: FakeElement): Element {
  return el as unknown as Element
}

test('suppresses a toolbar button inside the composer card', () => {
  const card = new FakeElement({ composerCard: true })
  const button = new FakeElement({ button: true }, card)
  assert.equal(shouldSuppressComposerMousedown(asElement(button)), true)
})

test('does not suppress an @ popup row inside the trigger menu', () => {
  const card = new FakeElement({ composerCard: true })
  const menu = new FakeElement({ triggerMenu: true }, card)
  const button = new FakeElement({ button: true }, menu)
  assert.equal(shouldSuppressComposerMousedown(asElement(button)), false)
})

test('does not suppress a tap on an icon nested inside an @ popup row', () => {
  const card = new FakeElement({ composerCard: true })
  const menu = new FakeElement({ triggerMenu: true }, card)
  const button = new FakeElement({ button: true }, menu)
  const icon = new FakeElement({}, button)
  assert.equal(shouldSuppressComposerMousedown(asElement(icon)), false)
})

test('does not suppress a crumb button inside the trigger menu', () => {
  const card = new FakeElement({ composerCard: true })
  const menu = new FakeElement({ triggerMenu: true }, card)
  const crumb = new FakeElement({ button: true }, menu)
  assert.equal(shouldSuppressComposerMousedown(asElement(crumb)), false)
})

test('does not suppress buttons outside the composer card', () => {
  const button = new FakeElement({ button: true })
  assert.equal(shouldSuppressComposerMousedown(asElement(button)), false)
})

test('does not suppress non-button targets', () => {
  const card = new FakeElement({ composerCard: true })
  const div = new FakeElement({}, card)
  assert.equal(shouldSuppressComposerMousedown(asElement(div)), false)
})

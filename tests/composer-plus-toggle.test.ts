import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  ADD_BUTTON_SELECTOR,
  EDITOR_SELECTOR,
  FOCUS_RELEASE_DELAYS_MS,
  FOCUS_SHADOW_MAX_MS,
  FOCUS_SHADOW_MIN_MS,
  shouldHoldShadow,
  shouldTakeBackArmedFocus,
  KEYBOARD_MIN_INSET_PX,
  keyboardIsVisible,
  shouldDropEditorFocus,
  isComposerAddButton,
  isEditorSurface,
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

test('the editor surface predicate is scoped to the Lexical root', () => {
  const card = new FakeElement({ composerCard: true })
  const editor = new FakeElement({ editor: true }, card)
  assert.equal(isEditorSurface(asElement(editor)), true)
  // A tap on a node inside the editable area still counts as the editor.
  assert.equal(isEditorSurface(asElement(new FakeElement({}, editor))), true)
  assert.equal(isEditorSurface(asElement(card)), false)
  assert.equal(isEditorSurface(asElement(new FakeElement({ add: true }, card))), false)
  assert.equal(isEditorSurface(null), false)
})

test('the focus-release ladder re-drops the keyboard early and late', () => {
  // The host re-focuses the editor from its onClick; one drop is not enough
  // because the IME is already animating (measured upstream: viewport 754 -> 471
  // about 170ms after the tap).
  assert.deepEqual([...FOCUS_RELEASE_DELAYS_MS], [120, 320, 640])
  for (const delay of FOCUS_RELEASE_DELAYS_MS) assert.ok(delay > 0)
})

test('the effect is installed by the client entry point', () => {
  const entry = readFileSync(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
  assert.match(entry, /installComposerPlusToggle\(ctx\)/)
  assert.match(entry, /from '\.\/effects\/composer-plus-toggle\.ts'/)
})

test('the focus shadow is bounded, so a stuck override is impossible', () => {
  // The shadow blocks the host's programmatic focus(); the cap is what keeps it
  // from outliving the interaction (the community plugin shipped an unbounded
  // guard and the editor could never be focused again).
  assert.ok(FOCUS_SHADOW_MAX_MS > FOCUS_RELEASE_DELAYS_MS[FOCUS_RELEASE_DELAYS_MS.length - 1]!)
  assert.ok(FOCUS_SHADOW_MAX_MS <= 3000, 'the override must not survive the interaction by long')
})

test('the blur is skipped while the keyboard is up, so the composer cannot jump', () => {
  // Reported on iOS after the first fix: the FIRST tap moved the composer row,
  // because blurring an editor whose keyboard is up starts the hide animation and
  // the keyboard is the composer's floor. Later taps looked fine only because the
  // keyboard was already down.
  const android = { iosViewportPan: false }
  assert.equal(shouldDropEditorFocus({ editorFocused: true, keyboardVisible: true, ...android }), false)
  assert.equal(shouldDropEditorFocus({ editorFocused: true, keyboardVisible: false, ...android }), true)
  // Nothing focused: nothing to release.
  assert.equal(shouldDropEditorFocus({ editorFocused: false, keyboardVisible: false, ...android }), false)
  assert.equal(shouldDropEditorFocus({ editorFocused: false, keyboardVisible: true, ...android }), false)
})

test('iOS never blurs, because a blur there nudges the visual viewport', () => {
  // Reported from a phone: the composer bounced up and back within 10-20ms - far
  // too fast for a keyboard (iOS takes ~250ms), which is what a programmatic blur
  // costs there. On iOS the focus shadow is the whole defence, so nothing moves.
  const ios = { iosViewportPan: true }
  assert.equal(shouldDropEditorFocus({ editorFocused: true, keyboardVisible: false, ...ios }), false)
  assert.equal(shouldDropEditorFocus({ editorFocused: true, keyboardVisible: true, ...ios }), false)
  assert.equal(shouldDropEditorFocus({ editorFocused: false, keyboardVisible: false, ...ios }), false)
})

test('the keyboard signal reads the visual viewport, not the layout viewport', () => {
  // No API: treat the keyboard as hidden (the blur is the safe default).
  assert.equal(keyboardIsVisible(null, 844), false)
  // Keyboard up: the visual viewport shrinks by the keyboard height.
  assert.equal(keyboardIsVisible({ height: 471, scale: 1 }, 844), true)
  assert.equal(keyboardIsVisible({ height: 844 - KEYBOARD_MIN_INSET_PX - 1, scale: 1 }, 844), true)
  // An address bar collapsing (~60px) is not a keyboard.
  assert.equal(keyboardIsVisible({ height: 844 - 60, scale: 1 }, 844), false)
  assert.equal(keyboardIsVisible({ height: 844 - KEYBOARD_MIN_INSET_PX, scale: 1 }, 844), false)
  // A pinch shrinks the visual viewport too, and must not be read as a keyboard:
  // that would skip the blur exactly when the user is zoomed in.
  assert.equal(keyboardIsVisible({ height: 400, scale: 2.5 }, 844), false)
})

test('the focus shadow may not end with the click that armed it', () => {
  // The host focuses the editor again from the effect that runs when its menu
  // opens: measured on a phone by the community plugin, the keyboard rose about
  // 200ms AFTER the click, once their shadow had already been restored. A window
  // that ends with the click blocks nothing - which is reported as "tapping +
  // still raises the keyboard".
  assert.equal(shouldHoldShadow({ menuOpen: false, armedMs: 0 }), true)
  assert.equal(shouldHoldShadow({ menuOpen: false, armedMs: FOCUS_SHADOW_MIN_MS - 1 }), true)
  assert.equal(shouldHoldShadow({ menuOpen: false, armedMs: FOCUS_SHADOW_MIN_MS }), false)
})

test('an open menu holds the shadow beyond the window', () => {
  // While its menu is on screen the host may focus the editor at any point, so
  // the window is a floor, not the release condition.
  assert.equal(shouldHoldShadow({ menuOpen: true, armedMs: 10_000 }), true)
})

test('the window outlives the host second focus and stays under the hard cap', () => {
  assert.ok(FOCUS_SHADOW_MIN_MS >= 600, 'the host re-focuses ~200ms after the click; the window needs margin')
  assert.ok(FOCUS_SHADOW_MIN_MS < FOCUS_SHADOW_MAX_MS, 'the cap must still be able to end a stuck window')
})

test('a focus that lands during the "+" interaction is taken back synchronously', () => {
  // The shadow only covers focus(); this is the fallback for a focus path it
  // does not patch. Blurring in a macrotask is too late - the IME has started -
  // so the rule is evaluated in the focusin capture phase.
  const live = { shadowArmed: true, targetIsEditor: true, editorFocused: true }
  assert.equal(shouldTakeBackArmedFocus(live), true)
  assert.equal(shouldTakeBackArmedFocus({ ...live, shadowArmed: false }), false, 'never outside the interaction')
  assert.equal(shouldTakeBackArmedFocus({ ...live, targetIsEditor: false }), false, 'a tap elsewhere is not ours')
  assert.equal(shouldTakeBackArmedFocus({ ...live, editorFocused: false }), false, 'nothing holds the focus')
})

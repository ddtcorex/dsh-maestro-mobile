import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createFocusShadow,
  type FocusableLike,
} from '../src/client/effects/editor-focus-shadow.ts'

/** A focusable stand-in that counts how often the real focus() runs. */
class FakeEditor implements FocusableLike {
  calls = 0
  isConnected = true

  focus(): void {
    this.calls += 1
  }
}

test('the shadow swallows programmatic focus while armed', () => {
  const editor = new FakeEditor()
  const shadow = createFocusShadow(() => editor)
  assert.equal(shadow.armed, false)
  editor.focus()
  assert.equal(editor.calls, 1)

  shadow.arm()
  assert.equal(shadow.armed, true)
  editor.focus()
  editor.focus()
  assert.equal(editor.calls, 1, 'armed: the host focus() must not reach the element')
})

test('restore gives focus back — the bug this pins is a shadow that never lifts', () => {
  // The community plugin shipped a guard whose restore() forgot to disarm, so
  // every later focusin was blurred and the user could never open the keyboard
  // again. A shadow that stays armed after restore() would fail this assertion.
  const editor = new FakeEditor()
  const shadow = createFocusShadow(() => editor)
  shadow.arm()
  editor.focus()
  shadow.restore()
  assert.equal(shadow.armed, false)
  editor.focus()
  assert.equal(editor.calls, 1, 'restored: focus() must reach the element again')

  // Restoring twice, or restoring without arming, is safe and changes nothing.
  shadow.restore()
  editor.focus()
  assert.equal(editor.calls, 2)
})

test('arming twice keeps exactly one override and a working restore', () => {
  const editor = new FakeEditor()
  const shadow = createFocusShadow(() => editor)
  shadow.arm()
  shadow.arm()
  editor.focus()
  assert.equal(editor.calls, 0)
  shadow.restore()
  editor.focus()
  assert.equal(editor.calls, 1)
})

test('a remounted editor is re-resolved and the old node is released', () => {
  const first = new FakeEditor()
  const second = new FakeEditor()
  let current: FakeEditor = first
  const shadow = createFocusShadow(() => current)
  shadow.arm()
  current = second
  shadow.arm()
  first.focus()
  second.focus()
  assert.equal(first.calls, 1, 'the old node must be un-shadowed when we move on')
  assert.equal(second.calls, 0, 'the new node carries the override')
  shadow.restore()
  second.focus()
  assert.equal(second.calls, 1)
})

test('no editor, or an element without focus, is a safe no-op', () => {
  const shadow = createFocusShadow(() => null)
  shadow.arm()
  assert.equal(shadow.armed, false)
  shadow.restore()

  const broken = {} as FocusableLike
  const brokenShadow = createFocusShadow(() => broken)
  brokenShadow.arm()
  assert.equal(brokenShadow.armed, false)
})

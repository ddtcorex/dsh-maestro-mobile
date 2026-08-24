import assert from 'node:assert/strict'
import test from 'node:test'
import { drawerCloseTiming } from '../src/client/effects/drawer-navigation.ts'

test('leaves a touched session row mounted until its click has propagated', () => {
  assert.equal(drawerCloseTiming('pointerup', true), 'ignore')
  assert.equal(drawerCloseTiming('click', true), 'after-click')
})

test('closes non-session drawer navigation immediately', () => {
  assert.equal(drawerCloseTiming('pointerup', false), 'immediate')
  assert.equal(drawerCloseTiming('click', false), 'immediate')
})

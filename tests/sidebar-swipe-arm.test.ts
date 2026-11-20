// The drawer's OPEN follow arms on a single move sample, and that is the whole
// danger: the axis lock only demands |dx| > |dy| at the sample that crosses
// 8 px, so a vertical scroll flick whose first 8 px happen to be horizontal
// used to mount the drawer mid-scroll. The release verdict still guards the
// commit (a short or slow stroke reverts), but the drawer popping out under a
// scrolling thumb is the wrong feedback regardless.
//
// The gate is a plain predicate so it can be pinned here rather than inferred
// from a browser run: keep demanding horizontal DOMINANCE at arm time, not just
// at the axis lock. A real horizontal swipe keeps |dy| near zero and still arms
// at 8 px, so the no-dead-zone behaviour from the 2026-08-29 report survives.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { openArmReady } from '../src/client/effects/sidebar-swipe.ts'

test('an open follow arms at the threshold when the stroke is horizontal', () => {
  assert.equal(openArmReady(8, 0), true)
  assert.equal(openArmReady(40, 1), true)
})

test('an open follow refuses to arm below the twitch threshold', () => {
  // Arming under 8 px would mount and unmount the drawer subtree on a twitch.
  assert.equal(openArmReady(7, 0), false)
  assert.equal(openArmReady(0, 0), false)
  // RTL arrives normalized as rightward travel, so a stroke the other way is
  // simply not an open stroke.
  assert.equal(openArmReady(-9, 1), false)
})

test('an open follow refuses to arm on a stroke that is still mostly vertical', () => {
  // A scroll flick: 8 px of horizontal drift against 9 px of vertical travel.
  // This is the shape that armed the drawer mid-scroll before the gate.
  assert.equal(openArmReady(8, 9), false)
  assert.equal(openArmReady(20, 60), false)
  // The gate is dominance with a margin, not equality: 24 against 20 is exactly
  // 1.2 and still arms, 24 against 20.1 is not.
  assert.equal(openArmReady(24, 20), true)
  assert.equal(openArmReady(24, 20.1), false)
})

test('the follow applies the gate before it arms, and reads the live y', () => {
  // The predicate above is only worth its file if applyFollow consults it
  // BEFORE armOpenFollow and with the stroke's vertical travel. A predicate
  // that ships unused is exactly the class of silent non-firing this repo has
  // been bitten by (the stale hash scope, the hook with no setter).
  const source = readFileSync(new URL('../src/client/effects/sidebar-swipe.ts', import.meta.url), 'utf8')
  const arm = source.indexOf('if (!openArmReady(travel, dy)) return')
  assert.ok(arm > -1, 'applyFollow must consult openArmReady')
  assert.ok(arm < source.indexOf('armOpenFollow(ctx)'), 'the gate must run before the arm')
  assert.match(source, /function applyFollow\(ctx: ClientContext, dx: number, dy: number\)/)
  assert.match(source, /applyFollow\(ctx, event\.clientX - startX, event\.clientY - startY\)/)
})

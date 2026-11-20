// Behavioural test for the lineage chip's synthetic-hover swallow.
//
// The shim's promise on a phone is "one tap, one toggle": the hover events that
// tap synthesizes must not reach upstream's hover timers. Which channel those
// timers live on is upstream's business and it moved: 0.2.2 puts them on the
// POINTER channel (the lineage root carries `onPointerLeave` ->
// `scheduleHoverClose`, 120 ms, gated only by `pinnedRef`, which the keyboard
// path this shim drives never sets). Swallowing the mouse family alone therefore
// leaves the tap's own `pointerout` / `pointerleave` free to close the card it
// just opened, measured upstream as "expanded true at 60 ms, false by 150 ms".
//
// The listener set is the contract, so this test drives the real installer
// against a minimal document stub and asserts what a later listener observes.
// Drop a type from the swallow, lose the capture phase, or narrow the scope, and
// the stub reports the leak. Upstream gave a permanently-skipped assertion the
// name of a green one once; this file exists so a silent non-firing cannot
// happen here.

import assert from 'node:assert/strict'
import test from 'node:test'

/** Node in the stub tree. Only the two selectors the shim uses are modelled. */
class FakeElement {
  isTrigger = false
  inScope = false
  parent: FakeElement | null = null
  readonly attrs = new Map<string, string>()
  readonly dispatched: string[] = []

  constructor(init: { parent?: FakeElement | null, isTrigger?: boolean, inScope?: boolean } = {}) {
    this.parent = init.parent ?? null
    this.isTrigger = init.isTrigger ?? false
    this.inScope = init.inScope ?? false
  }

  closest(selector: string): FakeElement | null {
    let node: FakeElement | null = this
    while (node !== null) {
      if (matches(node, selector)) return node
      node = node.parent
    }
    return null
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value)
  }

  dispatchEvent(event: { type: string, key?: string }): boolean {
    this.dispatched.push(event.key ?? event.type)
    return true
  }
}

/** Selector matching for the stub. An unknown selector is a stub bug, not a miss. */
function matches(node: FakeElement, selector: string): boolean {
  if (selector.includes('aria-haspopup')) return node.isTrigger
  if (selector.includes('data-lineage-root')) return node.inScope
  throw new Error(`document stub: unexpected selector ${selector}`)
}

class FakeEvent {
  type: string
  target: unknown
  isTrusted = true
  immediateStopped = false
  propagationStopped = false

  constructor(type: string, init: Record<string, unknown> = {}) {
    this.type = type
    Object.assign(this, init)
  }

  stopImmediatePropagation(): void {
    this.immediateStopped = true
  }

  stopPropagation(): void {
    this.propagationStopped = true
  }
}

interface Harness {
  readonly later: string[]
  readonly scope: FakeElement
  readonly chip: FakeElement
  readonly outside: FakeElement
  fire(type: string, target: FakeElement, init?: Record<string, unknown>): string[]
  advance(ms: number): void
}

/**
 * Install the real shim against the stub document.
 * @returns handles for driving events and reading what a later listener saw.
 */
async function arm(): Promise<Harness> {
  const listeners = new Map<string, Array<(event: FakeEvent) => void>>()
  const documentStub = {
    addEventListener(type: string, listener: (event: FakeEvent) => void): void {
      const bucket = listeners.get(type) ?? []
      bucket.push(listener)
      listeners.set(type, bucket)
    },
    removeEventListener(): void { /* the shim only removes on dispose */ },
  }
  let now = 1_000

  const globals = globalThis as Record<string, unknown>
  const saved = {
    Element: globals.Element,
    MouseEvent: globals.MouseEvent,
    KeyboardEvent: globals.KeyboardEvent,
    PointerEvent: globals.PointerEvent,
    document: globals.document,
    window: globals.window,
    now: Date.now,
  }
  globals.Element = FakeElement
  globals.MouseEvent = FakeEvent
  globals.KeyboardEvent = FakeEvent
  globals.PointerEvent = FakeEvent
  globals.document = documentStub
  globals.window = {
    matchMedia: () => ({ matches: true, addEventListener(): void {}, removeEventListener(): void {} }),
  }
  Date.now = () => now

  const restore = (): void => {
    Object.assign(globals, {
      Element: saved.Element,
      MouseEvent: saved.MouseEvent,
      KeyboardEvent: saved.KeyboardEvent,
      PointerEvent: saved.PointerEvent,
      document: saved.document,
      window: saved.window,
    })
    Date.now = saved.now
  }
  process.once('exit', restore)

  const { installSubagentChipTouch } = await import('../src/client/effects/subagent-chip-touch.ts')
  installSubagentChipTouch({ effect: (fn: () => unknown) => { fn() } } as never)

  // A later listener on the same node: anything the swallow lets through is seen
  // here, which is exactly the position upstream's hover timers are in.
  const later: string[] = []
  const types = ['mouseover', 'mouseout', 'mouseenter', 'mouseleave', 'pointerout', 'pointerleave']
  for (const type of types) documentStub.addEventListener(type, () => { later.push(type) })

  const scope = new FakeElement({ inScope: true })
  const chip = new FakeElement({ parent: scope, isTrigger: true, inScope: true })
  const outside = new FakeElement()

  return {
    later,
    scope,
    chip,
    outside,
    fire(type, target, init = {}) {
      later.length = 0
      const event = new FakeEvent(type, { target, ...init })
      for (const listener of listeners.get(type) ?? []) {
        listener(event)
        if (event.immediateStopped) break
      }
      return [...later]
    },
    advance(ms) {
      now += ms
    },
  }
}

/** Touch activity that arms the swallow window, exactly like a real tap. */
function tap(harness: Harness): void {
  harness.fire('pointerdown', harness.chip, { pointerType: 'touch' })
  harness.fire('pointerup', harness.chip, { pointerType: 'touch' })
}

test('a tap closes no door behind it: the pointer family is swallowed too', async () => {
  const harness = await arm()
  tap(harness)
  // 0.2.2 moved the hover timers to this channel: pointerleave reaches the
  // lineage root's onPointerLeave and its 120 ms close timer, pointerout is what
  // React's enter/leave plugin listens to for the same pair.
  assert.deepEqual(harness.fire('pointerleave', harness.chip, { pointerType: 'touch' }), [])
  assert.deepEqual(harness.fire('pointerout', harness.chip, { pointerType: 'touch' }), [])
})

test('the mouse family a tap synthesizes stays swallowed', async () => {
  const harness = await arm()
  tap(harness)
  for (const type of ['mouseover', 'mouseout', 'mouseenter', 'mouseleave']) {
    assert.deepEqual(harness.fire(type, harness.chip), [], `${type} reached a later listener`)
  }
})

test('the swallow stays inside the chip scope and inside its window', async () => {
  const harness = await arm()
  tap(harness)
  // Outside the chip box nothing is swallowed: the conversation keeps its hover.
  assert.deepEqual(harness.fire('pointerleave', harness.outside, { pointerType: 'touch' }), ['pointerleave'])
  // Untrusted (script-dispatched) events are never swallowed.
  assert.deepEqual(
    harness.fire('pointerleave', harness.chip, { pointerType: 'touch', isTrusted: false }),
    ['pointerleave'],
  )
  // After the window the swallow is spent: a real hover from a mouse later on
  // must behave natively.
  harness.advance(801)
  assert.deepEqual(harness.fire('pointerleave', harness.chip, { pointerType: 'touch' }), ['pointerleave'])
})

test('a mouse-only stroke never arms the swallow', async () => {
  const harness = await arm()
  harness.fire('pointerdown', harness.chip, { pointerType: 'mouse' })
  harness.fire('pointerup', harness.chip, { pointerType: 'mouse' })
  assert.deepEqual(harness.fire('pointerleave', harness.chip, { pointerType: 'mouse' }), ['pointerleave'])
})

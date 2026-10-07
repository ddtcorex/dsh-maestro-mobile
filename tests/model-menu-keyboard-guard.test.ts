import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  HOST_MENU,
  IDLE_DISARM_MS,
  MODEL_SEARCHBOX,
  createModelMenuGuard,
  type ModelMenuFocusElement,
  type ModelMenuFocusProto,
  type ModelMenuGuardHost,
} from '../src/client/effects/model-menu-keyboard-guard.ts'

test('the menu surface is scoped by the stable primitive marker only', () => {
  // Upstream carries a hashed `[class*="_7KE1Ra_menu"]` fallback; that form is
  // deliberately not ported — tests/no-hashed-class-prefix.test.ts fails the
  // build on any hash prefix in src/client, because a hash-built selector dies
  // on the next rebuild while every test still passes.
  assert.equal(HOST_MENU, '[data-menu-material]')
  assert.doesNotMatch(HOST_MENU, /\[class\*?=/)
})

test('the searchbox selector is exactly the two scoped alternatives', () => {
  // Pinned as written, not as a substring: a third unscoped alternative (e.g.
  // a bare `input[role="searchbox"]`) would swallow every search field in the
  // app, and a contains-assertion would never see it arrive.
  const alternatives = MODEL_SEARCHBOX.split(',').map((each) => each.trim())
  assert.deepEqual(alternatives, [
    '[data-menu-material] input[role="searchbox"]',
    'input[role="searchbox"][aria-controls$="-models"]',
  ])
  assert.doesNotMatch(MODEL_SEARCHBOX, /\[class\*?=/)
})

/** The structural face the two selector alternatives read. */
interface FieldDescriptor {
  tag: string
  role: string | null
  ariaControls: string | null
  inMenuSurface: boolean
}

/**
 * Evaluate one alternative of MODEL_SEARCHBOX against a field descriptor.
 *
 * A hand-rolled evaluator rather than a DOM engine (the suite has no DOM): the
 * alternatives themselves come from the constant above, so a change to the
 * shipped selector fails the exact-text pin first instead of silently testing
 * stale text here.
 * @param alternative - one comma-separated alternative of MODEL_SEARCHBOX.
 * @param field - the field to test.
 * @returns true when this alternative matches the field.
 */
function matchesAlternative(alternative: string, field: FieldDescriptor): boolean {
  if (alternative === '[data-menu-material] input[role="searchbox"]') {
    return field.inMenuSurface && field.tag === 'input' && field.role === 'searchbox'
  }
  if (alternative === 'input[role="searchbox"][aria-controls$="-models"]') {
    return field.tag === 'input'
      && field.role === 'searchbox'
      && (field.ariaControls ?? '').endsWith('-models')
  }
  throw new Error(`unknown selector alternative: ${alternative}`)
}

/**
 * Whether MODEL_SEARCHBOX matches a field, mirroring `Element.matches`.
 * @param field - the field to test.
 * @returns true when any alternative matches.
 */
function matchesSearchbox(field: FieldDescriptor): boolean {
  return MODEL_SEARCHBOX.split(',').map((each) => each.trim()).some((alternative) =>
    matchesAlternative(alternative, field))
}

test('the searchbox selector matches the model pane field', () => {
  assert.equal(
    matchesSearchbox({ tag: 'input', role: 'searchbox', ariaControls: 'menu-1-models', inMenuSurface: true }),
    true,
  )
  // The `-models` control matches even where the portal structure differs.
  assert.equal(
    matchesSearchbox({ tag: 'input', role: 'searchbox', ariaControls: 'menu-1-models', inMenuSurface: false }),
    true,
  )
})

test('the searchbox selector ignores a generic settings input', () => {
  // A plain settings text input: no role, no model control, no menu surface.
  assert.equal(
    matchesSearchbox({ tag: 'input', role: null, ariaControls: null, inMenuSurface: false }),
    false,
  )
  // A settings search field without the model control, outside any menu.
  assert.equal(
    matchesSearchbox({ tag: 'input', role: 'searchbox', ariaControls: null, inMenuSurface: false }),
    false,
  )
  // A searchbox from another menu that carries an unrelated control id.
  assert.equal(
    matchesSearchbox({ tag: 'input', role: 'searchbox', ariaControls: 'menu-2-items', inMenuSurface: false }),
    false,
  )
  // The role alone is not enough: only `input` elements are shadowed.
  assert.equal(
    matchesSearchbox({ tag: 'div', role: 'searchbox', ariaControls: 'menu-1-models', inMenuSurface: true }),
    false,
  )
})

/** Stand-in for an input element: answers the guard's one `matches()` question. */
class FakeField implements ModelMenuFocusElement {
  readonly model: boolean

  constructor(model: boolean) {
    this.model = model
  }

  matches(selector: string): boolean {
    assert.equal(selector, MODEL_SEARCHBOX)
    return this.model
  }
}

/** Stand-in for `HTMLInputElement.prototype`: counts native `focus()` runs. */
function createFakeProto(): { proto: ModelMenuFocusProto, nativeCalls: Map<unknown, number> } {
  const nativeCalls = new Map<unknown, number>()
  const proto: ModelMenuFocusProto = {
    focus(this: unknown): void {
      nativeCalls.set(this, (nativeCalls.get(this) ?? 0) + 1)
    },
  }
  return { proto, nativeCalls }
}

/** Timer doubles: the test fires the captured idle callback by hand. */
function createFakeTimers(): {
  later: ModelMenuGuardHost['later'],
  cancel: ModelMenuGuardHost['cancel'],
  pending: Array<() => void>,
  cancelled: number[],
  scheduledMs: number[],
} {
  const pending: Array<() => void> = []
  const cancelled: number[] = []
  const scheduledMs: number[] = []
  let nextId = 1
  return {
    pending,
    cancelled,
    scheduledMs,
    later: (run: () => void, ms: number): number => {
      scheduledMs.push(ms)
      pending.push(run)
      nextId += 1
      return nextId
    },
    cancel: (id: number): void => {
      cancelled.push(id)
    },
  }
}

/**
 * Build a guard over fakes.
 * @param menuOpen - whether a host menu surface is in the document.
 * @returns the guard plus its fakes.
 */
function createFakeGuard(menuOpen: boolean): {
  guard: ReturnType<typeof createModelMenuGuard>,
  proto: ModelMenuFocusProto,
  nativeCalls: Map<unknown, number>,
  timers: ReturnType<typeof createFakeTimers>,
  setMenuOpen(open: boolean): void,
} {
  const { proto, nativeCalls } = createFakeProto()
  const timers = createFakeTimers()
  let open = menuOpen
  const guard = createModelMenuGuard({
    proto,
    menuOpen: () => open,
    later: timers.later,
    cancel: timers.cancel,
  })
  return {
    guard,
    proto,
    nativeCalls,
    timers,
    setMenuOpen: (value: boolean): void => {
      open = value
    },
  }
}

test('arm makes a matching focus a no-op and passes a non-matching one through', () => {
  const { guard, proto, nativeCalls } = createFakeGuard(false)
  assert.equal(guard.armed, false)
  guard.arm()
  assert.equal(guard.armed, true)

  const modelField = new FakeField(true)
  const settingsField = new FakeField(false)
  proto.focus.call(modelField)
  proto.focus.call(settingsField)
  assert.equal(nativeCalls.get(modelField) ?? 0, 0, 'model searchbox focus must not run')
  assert.equal(nativeCalls.get(settingsField) ?? 0, 1, 'any other field focuses natively')
})

test('disarm restores the native method exactly', () => {
  const { guard, proto, nativeCalls } = createFakeGuard(false)
  const before = proto.focus
  const modelField = new FakeField(true)

  guard.arm()
  proto.focus.call(modelField)
  assert.equal(nativeCalls.get(modelField) ?? 0, 0)

  guard.disarm()
  assert.equal(guard.armed, false)
  assert.equal(proto.focus, before, 'disarm must put the captured method back, not a copy')
  proto.focus.call(modelField)
  assert.equal(nativeCalls.get(modelField) ?? 0, 1, 'restored: focus must reach the field again')

  // Restoring twice, or restoring without arming, is safe and changes nothing.
  guard.disarm()
  proto.focus.call(modelField)
  assert.equal(nativeCalls.get(modelField) ?? 0, 2)
})

test('arming twice keeps one shadow and a working restore', () => {
  const { guard, proto, nativeCalls } = createFakeGuard(false)
  const modelField = new FakeField(true)
  guard.arm()
  guard.arm()
  proto.focus.call(modelField)
  assert.equal(nativeCalls.get(modelField) ?? 0, 0)
  guard.disarm()
  proto.focus.call(modelField)
  assert.equal(nativeCalls.get(modelField) ?? 0, 1)
})

test('a tap arms the shadow and schedules the idle check at ~2s', () => {
  assert.equal(IDLE_DISARM_MS, 2_000)
  const { guard, timers } = createFakeGuard(false)
  guard.onPointerDown()
  assert.equal(guard.armed, true)
  assert.deepEqual(timers.scheduledMs, [IDLE_DISARM_MS])
})

test('the idle check disarms only when no menu is up', () => {
  const closed = createFakeGuard(false)
  closed.guard.onPointerDown()
  assert.equal(closed.timers.pending.length, 1)
  closed.timers.pending[0]()
  assert.equal(closed.guard.armed, false, 'no menu up: the prototype must be given back')

  const open = createFakeGuard(true)
  open.guard.onPointerDown()
  open.timers.pending[0]()
  assert.equal(open.guard.armed, true, 'menu still up: the shadow must survive the idle check')
  open.setMenuOpen(false)
  open.guard.onPointerDown()
  open.timers.pending[open.timers.pending.length - 1]()
  assert.equal(open.guard.armed, false, 'menu gone by the next check: disarm then')
})

test('a second tap re-arms the idle window instead of stacking timers', () => {
  const { guard, timers } = createFakeGuard(false)
  guard.onPointerDown()
  guard.onPointerDown()
  assert.equal(timers.cancelled.length >= 1, true, 'the previous idle check must be cancelled')
  assert.equal(guard.armed, true)
})

/**
 * Install the effect against hand-built fake globals and return what it did.
 *
 * This exists because a `typeof fn === 'function'` test passes on an effect
 * whose listener is never attached. Asserting the registered listener and the
 * disposer's cleanup is the behaviour that matters.
 * @returns listeners, captured disposer inputs and a global restorer.
 */
function installWithFakeDom(): {
  listeners: Map<string, Array<{ handler: (...args: never[]) => void, capture: boolean }>>,
  removed: Array<{ type: string, capture: boolean }>,
  clearedTimers: number[],
  originalFocus: (...args: never[]) => void,
  cleanup: () => void,
  restore: () => void,
} {
  const listeners = new Map<string, Array<{ handler: (...args: never[]) => void, capture: boolean }>>()
  const removed: Array<{ type: string, capture: boolean }> = []
  const clearedTimers: number[] = []
  const saved = {
    document: (globalThis as Record<string, unknown>).document,
    window: (globalThis as Record<string, unknown>).window,
    htmlInputElement: (globalThis as Record<string, unknown>).HTMLInputElement,
  }
  const originalFocus = (): void => {}
  const doc = {
    addEventListener: (type: string, handler: (...args: never[]) => void, capture: boolean): void => {
      listeners.set(type, [...(listeners.get(type) ?? []), { handler, capture }])
    },
    removeEventListener: (type: string, handler: (...args: never[]) => void, capture: boolean): void => {
      const kept = (listeners.get(type) ?? []).filter((each) => each.handler !== handler)
      listeners.set(type, kept)
      removed.push({ type, capture })
    },
    querySelector: (): null => null,
  }
  const win = {
    setTimeout: (): number => 1,
    clearTimeout: (id: number): void => {
      clearedTimers.push(id)
    },
    matchMedia: (): { matches: boolean, addEventListener: () => void, removeEventListener: () => void } => ({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  }
  class FakeInput {}
  (FakeInput.prototype as Record<string, unknown>).focus = originalFocus
  const globals = { document: doc, window: win, HTMLInputElement: FakeInput }
  for (const [key, value] of Object.entries(globals)) {
    (globalThis as Record<string, unknown>)[key] = value
  }
  let cleanup: () => void = () => {}
  const ctx = {
    effect: (fn: () => () => void): void => {
      cleanup = fn()
    },
  }
  return {
    ctx,
    listeners,
    removed,
    clearedTimers,
    originalFocus,
    cleanup: () => cleanup(),
    restore: () => {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete (globalThis as Record<string, unknown>)[key]
        else (globalThis as Record<string, unknown>)[key] = value
      }
    },
  }
}

test('the effect registers one capture pointerdown listener and nothing else', async () => {
  const { installModelMenuKeyboardGuard } = await import('../src/client/effects/model-menu-keyboard-guard.ts')
  const fake = installWithFakeDom()
  try {
    installModelMenuKeyboardGuard(fake.ctx as never)
    const pointerdown = fake.listeners.get('pointerdown') ?? []
    assert.equal(pointerdown.length, 1, 'exactly one pointerdown listener')
    assert.equal(pointerdown[0].capture, true, 'capture phase: strictly before the host passive effect')
    assert.deepEqual([...fake.listeners.keys()], ['pointerdown'], 'no MutationObserver, no focusin tap-back')
  } finally {
    fake.restore()
  }
})

test('dispose removes the listener and restores the prototype', async () => {
  const { installModelMenuKeyboardGuard } = await import('../src/client/effects/model-menu-keyboard-guard.ts')
  const fake = installWithFakeDom()
  try {
    installModelMenuKeyboardGuard(fake.ctx as never)
    const [entry] = fake.listeners.get('pointerdown') ?? []
    // Arm the shadow through the registered listener, so dispose has one.
    entry.handler()
    fake.cleanup()
    assert.deepEqual(fake.listeners.get('pointerdown'), [], 'the listener must be removed')
    assert.deepEqual(
      fake.removed,
      [{ type: 'pointerdown', capture: true }],
      'removed in the same capture phase it was added in',
    )
    const proto = (globalThis as Record<string, unknown>).HTMLInputElement as unknown as {
      prototype: { focus: (...args: never[]) => void },
    }
    assert.equal(proto.prototype.focus, fake.originalFocus, 'the native method must be put back')
    assert.equal(fake.clearedTimers.length >= 1, true, 'the idle timer must be cancelled')
  } finally {
    fake.restore()
  }
})

test('the effect is installed by the client entry point', async () => {
  const mod = await import('../src/client/effects/model-menu-keyboard-guard.ts')
  assert.equal(typeof mod.installModelMenuKeyboardGuard, 'function')
  assert.equal(typeof mod.createModelMenuGuard, 'function')
  const entry = readFileSync(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
  assert.match(entry, /installModelMenuKeyboardGuard\(ctx\)/)
  assert.match(entry, /from '\.\/effects\/model-menu-keyboard-guard\.ts'/)
})

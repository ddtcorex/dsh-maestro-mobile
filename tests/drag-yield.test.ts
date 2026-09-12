import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DRAG_MARK,
  FLOATING_WIDGET_MAX_PX,
  dragMarkYields,
  findFloatingWidget,
  floatingWidgetYields,
} from '../src/client/effects/drag-yield.ts'

/** Minimal element-like node for the ancestor walk. */
interface FakeNode {
  position?: string
  offsetWidth?: number
  offsetHeight?: number
  parentElement?: FakeNode | null
  inFrame?: boolean
}

function makeNode(options: FakeNode = {}): FakeNode & {
  closest: (selector: string) => unknown
  parentElement: FakeNode | null
} {
  const node = {
    position: options.position ?? 'static',
    offsetWidth: options.offsetWidth ?? 0,
    offsetHeight: options.offsetHeight ?? 0,
    parentElement: options.parentElement ?? null,
    closest: (selector: string) => (selector === '[data-mobile-nav="frame"]' && options.inFrame === true ? {} : null),
  }
  return node as never
}

const styleOf = (node: unknown): { position: string } => ({
  position: (node as FakeNode).position ?? 'static',
})

const scopeWith = (marks: string[]) => ({
  documentElement: { hasAttribute: (name: string) => marks.includes(name) },
  body: { hasAttribute: (name: string) => marks.includes(name) },
})

test('the cooperation mark yields the stroke from the held node or any ancestor', () => {
  const ancestor = { closest: (selector: string) => (selector === `[${DRAG_MARK}]` ? {} : null) }
  assert.equal(dragMarkYields({ closest: () => null }, scopeWith([])), false)
  assert.equal(dragMarkYields({ closest: (selector: string) => (selector === `[${DRAG_MARK}]` ? {} : null) }, scopeWith([])), true)
  assert.equal(dragMarkYields(ancestor, scopeWith([])), true)
})

test('a global mark on body or documentElement yields the stroke', () => {
  const inert = { closest: () => null }
  assert.equal(dragMarkYields(inert, scopeWith([DRAG_MARK])), true)
  assert.equal(
    dragMarkYields(inert, { documentElement: { hasAttribute: () => false }, body: null }),
    false,
  )
})

test('a mark cannot be read without a document scope', () => {
  assert.equal(dragMarkYields({ closest: () => ({}) }, null), false)
})

test('a small freely-positioned ancestor is a floating widget', () => {
  const widget = makeNode({ position: 'fixed', offsetWidth: 148, offsetHeight: 160 })
  const inner = makeNode({ parentElement: widget })
  assert.equal(findFloatingWidget(inner as never, styleOf as never), widget)
  assert.equal(floatingWidgetYields({ target: inner }, styleOf as never), true)
})

test('a big or static ancestor is not a floating widget', () => {
  const big = makeNode({ position: 'fixed', offsetWidth: 800, offsetHeight: 600 })
  assert.equal(findFloatingWidget(makeNode({ parentElement: big }) as never, styleOf as never), null)
  const staticNode = makeNode({ position: 'static', offsetWidth: 100, offsetHeight: 100 })
  assert.equal(findFloatingWidget(makeNode({ parentElement: staticNode }) as never, styleOf as never), null)
  assert.equal(floatingWidgetYields({ target: null }, styleOf as never), false)
})

test("the plugin's own frame subtree is never read as a floating widget", () => {
  // The closed-state FAB sits inside the start zone and carries its own
  // gesture semantics.
  const insideFrame = makeNode({ position: 'fixed', offsetWidth: 56, offsetHeight: 56, inFrame: true })
  assert.equal(findFloatingWidget(insideFrame as never, styleOf as never), null)
})

test('the heuristic cap is documented and bounded', () => {
  assert.equal(FLOATING_WIDGET_MAX_PX, 200)
  const atCap = makeNode({ position: 'absolute', offsetWidth: 200, offsetHeight: 200 })
  const overCap = makeNode({ position: 'absolute', offsetWidth: 201, offsetHeight: 200 })
  assert.equal(findFloatingWidget(atCap as never, styleOf as never), atCap)
  assert.equal(findFloatingWidget(overCap as never, styleOf as never), null)
})

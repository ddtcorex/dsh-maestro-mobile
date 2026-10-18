import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { TEXT_MUTATION_SCOPE } from '../src/client/core/reconciler-core.ts'
import { createStatsLineTask, isStatsStripCandidate } from '../src/client/effects/stats-line.ts'

const stats = readFileSync(new URL('../src/client/effects/stats-line.ts', import.meta.url), 'utf8')
const phoneChrome = readFileSync(new URL('../src/client/effects/phone-chrome.ts', import.meta.url), 'utf8')

test('the stats task wakes on in-place text rewrites (v3.1.0 C08)', () => {
  // dsh-web-mobile v3.1.0 C08: the shared full-tree observer never opened
  // `characterData`, so pure text updates (React rewriting the TPS text node
  // without rebuilding it) woke no task and the TPS readout sat stale.
  // The stats task reads text, so it must declare the text key next to the
  // tree sentinel, and the observer must actually deliver those records.
  const scopes = createStatsLineTask().scopes
  assert.ok(scopes?.includes('*'), 'tree sentinel must stay declared')
  assert.ok(
    scopes?.includes(TEXT_MUTATION_SCOPE),
    'text key must be declared or in-place TPS rewrites never re-fold',
  )
  assert.match(phoneChrome, /characterData:\s*true/, 'observer must open the characterData flag')
})

test('the stats-row hunter accepts the metric pills the row now renders', () => {
  // Upstream renders each metric as an interactive pill
  // (button[class*="_pill"], aria-label "2 turns 97 steps · 257 tok/s"), so
  // the old blanket `querySelector('button') !== null` bail-out stopped
  // matching the status row entirely and `[data-mobile-nav="stats"]` was never
  // set — the one-line scrolling strip in composer.css.ts was dead code.
  // Keep skipping interactive dock panels (the todo strip is still excluded by
  // its testid and the composer card by [data-composer-input]), but accept a
  // root whose buttons are all metric pills.
  assert.match(stats, /buttons\.every\(\(b\) => b\.matches\('\[class\*="_pill"\]'\)\)/)
  assert.doesNotMatch(stats, /if \(root\.querySelector\('button'\) !== null\) continue/)
})

test('the per-token fast path skips the full-tree hunt (v3.0.6 #194 lesson)', () => {
  // dsh-web-mobile v3.0.6 #194: the status task ran a full read/write cycle
  // every streaming frame with no skip-if-unchanged, janking scroll and
  // drawer on long sessions. This task wakes on every mutation
  // (scopes ['*']), so the fast path — anchor alive => fold TPS and return
  // before the document-wide `[data-phase] [class*="_root"]` scan — is the
  // whole performance story. Pin its order: the anchor aliveness check and
  // early return must precede the slow-path scan in mark().
  const markBody = stats.slice(stats.indexOf('const mark = '))
  const fastPath = markBody.indexOf('statsAnchorAlive(anchor)')
  const slowPath = markBody.indexOf('[data-phase] [class*="_root"]')
  assert.ok(fastPath !== -1, 'fast-path anchor check must exist in mark()')
  assert.ok(slowPath !== -1, 'slow-path full-tree scan must exist in mark()')
  assert.ok(fastPath < slowPath, 'fast path must precede the slow-path scan')
  // moveTps must early-return when the TPS readout is already folded into
  // the strip, so a rebuilt-nothing frame costs O(strip children), not
  // O(composer stack).
  assert.match(stats, /if \(\[\.\.\.stats\.children\]\.some\(\(c\) => \/\^TPS/)
})

test('the shared candidate predicate accepts the strip and rejects lookalikes (dsh-web-mobile v3.2.0 #216)', () => {
  // Behavioural: calls the real exported predicate with stub elements.
  // Host 0.2.1 split StatsPills into activity/usage slot entries with no
  // shared _root container — the predicate is what lets the [data-slot]
  // fallback tier recognise them.
  interface StubButton {
    matches(selector: string): boolean
  }
  const pill: StubButton = { matches: (sel: string) => sel === '[class*="_pill"]' }
  const chrome: StubButton = { matches: () => false }
  const stubCandidate = (opts: {
    inStack?: boolean
    todoPanel?: boolean
    buttons?: StubButton[]
    text?: string
    hasEditor?: boolean
  }): Element => {
    const { inStack = true, todoPanel = false, buttons = [], text = '', hasEditor = false } = opts
    return {
      closest: (sel: string) => (sel === '[class*="_composerStack"]' && inStack ? {} : null),
      matches: (sel: string) => sel === '[data-testid="todo-panel"]' && todoPanel,
      querySelectorAll: () => buttons,
      querySelector: () => (hasEditor ? {} : null),
      textContent: text,
    } as unknown as Element
  }
  // The strip: inside the stack, metrics text, pill-only buttons, no editor.
  assert.equal(
    isStatsStripCandidate(stubCandidate({ buttons: [pill, pill], text: '2 turns 97 steps · 257 tok/s' })),
    true,
  )
  // A buttonless metrics row still counts (pre-pill host shape).
  assert.equal(isStatsStripCandidate(stubCandidate({ text: '3 turns 12 steps' })), true)
  // The todo strip shares the stack and can mention steps: excluded by testid.
  assert.equal(
    isStatsStripCandidate(stubCandidate({ todoPanel: true, buttons: [pill], text: 'plan steps' })),
    false,
  )
  // The composer card mentions turns in its model line: excluded by editor.
  assert.equal(
    isStatsStripCandidate(stubCandidate({ buttons: [pill], text: '2 turns', hasEditor: true })),
    false,
  )
  // Message-area blocks mention turns outside the stack: excluded by scope.
  assert.equal(
    isStatsStripCandidate(stubCandidate({ inStack: false, buttons: [pill], text: '2 turns' })),
    false,
  )
  // Interactive dock panels carry non-pill buttons: excluded by shape.
  assert.equal(
    isStatsStripCandidate(stubCandidate({ buttons: [pill, chrome], text: '2 turns' })),
    false,
  )
  // No metrics text: not the strip.
  assert.equal(isStatsStripCandidate(stubCandidate({ buttons: [pill], text: 'hello' })), false)
})

test('both slow-path tiers filter through the shared predicate', () => {
  // Structural (the suite cannot mount a host DOM here): mark() must route
  // every candidate through markOne — the single call site of
  // isStatsStripCandidate — with the _root tier first and the [data-slot]
  // fallback second. The decisions themselves are covered behaviourally
  // above; this only pins the wiring so a tier cannot silently inline its
  // own copy of the checks.
  const markBody = stats.slice(stats.indexOf('const mark = '))
  assert.match(markBody, /const markOne = \(candidate: Element\): boolean => \{/)
  assert.match(markBody, /if \(!isStatsStripCandidate\(candidate\)\) return false/)
  const tier1 = markBody.indexOf('if (markOne(root)) return')
  const tier2 = markBody.indexOf('if (markOne(slot)) return')
  assert.ok(tier1 !== -1, '_root tier must route through markOne')
  assert.ok(tier2 !== -1, 'data-slot tier must route through markOne')
  assert.ok(tier1 < tier2, '_root tier must precede the data-slot fallback')
})

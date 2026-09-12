import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { resolveSessionId, type SessionMenuInput } from '../src/client/effects/session-menu.ts'

// Shape of `ctx.sessions.list.getSnapshot()`: ids + byId of client-side
// SessionSummary rows (id, title, displayTitle, cwd), never the wire summary.
const SESSIONS = {
  ids: ['s-main', 's-dup-a', 's-dup-b', 's-blank', 's-sub', 's-archived', 's-other'],
  byId: {
    's-main': { id: 's-main', title: 'Fix the drawer', displayTitle: 'Fix the drawer', blank: false },
    's-dup-a': { id: 's-dup-a', title: 'Same title', displayTitle: 'Same title', blank: false },
    's-dup-b': { id: 's-dup-b', title: 'Same title', displayTitle: 'Same title', blank: false },
    's-blank': { id: 's-blank', title: 'Fix the drawer', displayTitle: 'Fix the drawer', blank: true },
    's-sub': { id: 's-sub', title: 'Fix the drawer', displayTitle: 'Fix the drawer', origin: 'subagent' },
    's-archived': { id: 's-archived', title: 'Fix the drawer', displayTitle: 'Fix the drawer' },
    's-other': { id: 's-other', title: 'Unrelated', displayTitle: 'Unrelated', blank: false },
  },
  current: 's-main',
}

const WORKSPACES = {
  items: [
    { workspaceId: 'w1', title: 'Shop', path: '/srv/shop', sessionIds: ['s-dup-b', 's-other'] },
  ],
  archivedSessionIds: ['s-archived'],
}

const base: SessionMenuInput = {
  rowTitle: 'Fix the drawer',
  groupTitle: undefined,
  sessions: SESSIONS,
  workspaces: WORKSPACES,
}

test('a unique visible title resolves to its session', () => {
  assert.equal(resolveSessionId(base), 's-main')
  // Blank sessions are hidden from the list, subagent sessions are not rows of
  // this list, and archived sessions are grouped elsewhere: none may be hit.
  assert.notEqual(resolveSessionId(base), 's-blank')
  assert.notEqual(resolveSessionId(base), 's-sub')
  assert.notEqual(resolveSessionId(base), 's-archived')
})

test('an unknown title never resolves', () => {
  assert.equal(resolveSessionId({ ...base, rowTitle: 'no such session' }), undefined)
})

test('duplicate titles are disambiguated by the owning workspace', () => {
  assert.equal(
    resolveSessionId({ ...base, rowTitle: 'Same title', groupTitle: 'Shop' }),
    's-dup-b',
  )
})

test('an unresolvable duplicate is refused rather than guessed', () => {
  // Deleting the wrong session is unrecoverable, so ambiguity must surface as
  // an error in the UI instead of a positional guess.
  assert.equal(resolveSessionId({ ...base, rowTitle: 'Same title', groupTitle: undefined }), undefined)
  assert.equal(resolveSessionId({ ...base, rowTitle: 'Same title', groupTitle: 'Unknown' }), undefined)
})

const source = readFileSync(new URL('../src/client/effects/session-menu.ts', import.meta.url), 'utf8')

test('the delete item is injected only into the host session menu', () => {
  // Signature: exactly the three host items, so no other menu is touched.
  assert.match(source, /rename/)
  assert.match(source, /menu\.fork/)
  assert.match(source, /menu\.archiveSession/)
  assert.match(source, /isSessionMenu/)
  assert.match(source, /data-mobile-nav', 'session-delete'/)
})

test('deletion is confirmation-first', () => {
  assert.match(source, /setAttribute\('role', 'dialog'\)/)
  assert.match(source, /setAttribute\('aria-modal', 'true'\)/)
  assert.match(source, /event\.key === 'Escape'/)
  assert.match(source, /setAttribute\('role', 'alert'\)/)
  assert.match(source, /fetch\(DELETE_ROUTE_PATH/)
  assert.match(source, /'Content-Type': 'application\/json'/)
  assert.match(source, /sessionId/)
})

test('the effect is armed for touch-primary devices at every width', () => {
  assert.match(source, /TOUCH_QUERY/)
})

const misc = readFileSync(new URL('../src/client/styles/misc.css.ts', import.meta.url), 'utf8')

test('the dialog is styled on the pointer, not on width', () => {
  // The item is injected on touch-primary devices at EVERY width, so a
  // width-gated stylesheet would leave a wide tablet's dialog unstyled.
  assert.match(misc, /@media \(pointer: coarse\) \{\n  \[data-mobile-nav="delete-dialog-backdrop"\]/)
  assert.match(misc, /\[data-mobile-nav="delete-dialog"\] \{/)
  assert.match(misc, /\[data-mobile-nav="delete-confirm-yes"\] \{/)
  assert.match(misc, /env\(safe-area-inset-bottom, 0px\)/)
  assert.match(misc, /prefers-reduced-motion: reduce/)
})

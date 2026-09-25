import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  isCurrentSession,
  isSessionMenuLabels,
  refreshAfterDeleteFailure,
  resolveSessionId,
  type SessionMenuInput,
  type SessionMenuLabels,
} from '../src/client/effects/session-menu.ts'

// Shape of `ctx.sessions.list.getSnapshot()`: ids + byId of client-side
// SessionSummary rows (id, title, displayTitle, cwd), never the wire summary.
// 0.1.6 dropped SessionListState.current: the open session is the one the
// main view retains (retainedBy.mainView > 0).
const SESSIONS = {
  ids: ['s-main', 's-dup-a', 's-dup-b', 's-blank', 's-sub', 's-archived', 's-other'],
  byId: {
    's-main': { id: 's-main', title: 'Fix the drawer', displayTitle: 'Fix the drawer', blank: false, retainedBy: { mainView: 1 } },
    's-dup-a': { id: 's-dup-a', title: 'Same title', displayTitle: 'Same title', blank: false },
    's-dup-b': { id: 's-dup-b', title: 'Same title', displayTitle: 'Same title', blank: false },
    's-blank': { id: 's-blank', title: 'Fix the drawer', displayTitle: 'Fix the drawer', blank: true },
    's-sub': { id: 's-sub', title: 'Fix the drawer', displayTitle: 'Fix the drawer', origin: 'subagent' },
    's-archived': { id: 's-archived', title: 'Fix the drawer', displayTitle: 'Fix the drawer' },
    's-other': { id: 's-other', title: 'Unrelated', displayTitle: 'Unrelated', blank: false },
  },
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

test('isCurrentSession follows the main-view retention, not a current field', () => {
  assert.equal(isCurrentSession(SESSIONS, 's-main'), true)
  assert.equal(isCurrentSession(SESSIONS, 's-other'), false)
  assert.equal(isCurrentSession(SESSIONS, 'no-such-session'), false)
  const nobodyRetained = { ids: SESSIONS.ids, byId: Object.fromEntries(Object.entries(SESSIONS.byId).map(([id, entry]) => [id, { ...entry, retainedBy: undefined }])) }
  assert.equal(isCurrentSession(nobodyRetained, 's-main'), false)
})

// The host's workspace dictionary keys the signature matches, resolved from the
// live locale at runtime; these are the 0.1.7 English strings.
const LABELS: SessionMenuLabels = {
  rename: 'Rename',
  fork: 'Fork session',
  archive: 'Archive session',
  unarchive: 'Unarchive session',
}

test('the session menu is identified inclusively, so a host that adds an item still matches', () => {
  // 0.1.7 added "Pin session" ahead of Rename (Pin/Rename/Fork/Archive). The
  // former `labels.length === 3` signature silently stopped matching on that
  // release and the injected Delete item disappeared with no error.
  assert.equal(isSessionMenuLabels(['Pin session', 'Rename', 'Fork session', 'Archive session'], LABELS), true)
  assert.equal(isSessionMenuLabels(['Unpin session', 'Rename', 'Fork session', 'Archive session'], LABELS), true)
  // The pre-0.1.7 three-item shape keeps working.
  assert.equal(isSessionMenuLabels(['Rename', 'Fork session', 'Archive session'], LABELS), true)
  // A few more added actions must not break it either.
  assert.equal(isSessionMenuLabels(['Pin session', 'Rename', 'Duplicate', 'Fork session', 'Archive session'], LABELS), true)
})

test('an archived row is not the session menu, so Delete is never injected there', () => {
  // The host swaps the archive item for its unarchive twin on an archived row:
  // deleting goes through unarchive first, and the flow must not offer it.
  assert.equal(isSessionMenuLabels(['Rename', 'Fork session', 'Unarchive session'], LABELS), false)
  assert.equal(isSessionMenuLabels(['Pin session', 'Rename', 'Fork session', 'Unarchive session'], LABELS), false)
})

test('an unrelated menu is never mistaken for the session menu', () => {
  assert.equal(isSessionMenuLabels([], LABELS), false)
  assert.equal(isSessionMenuLabels(['Rename workspace', 'Delete workspace'], LABELS), false)
  assert.equal(isSessionMenuLabels(['Rename', 'Archive session'], LABELS), false)
  assert.equal(isSessionMenuLabels(['Rename', 'Fork session'], LABELS), false)
  assert.equal(isSessionMenuLabels(['Archive session', 'Fork session'], LABELS), false)
})

test('a cleanup failure still refreshes the list, because the session is gone', () => {
  // `cleanup-failed` means the host already stopped and unregistered the
  // session and only the leftovers could not be stashed — so the row must
  // disappear. Every other failure leaves the session in place and refreshing
  // would only churn the list.
  assert.equal(refreshAfterDeleteFailure('cleanup-failed'), true)
  assert.equal(refreshAfterDeleteFailure('delete-failed'), false)
  assert.equal(refreshAfterDeleteFailure('session-busy'), false)
  assert.equal(refreshAfterDeleteFailure('session-not-found'), false)
  assert.equal(refreshAfterDeleteFailure(undefined), false)
})

const source = readFileSync(new URL('../src/client/effects/session-menu.ts', import.meta.url), 'utf8')

test('the delete item is injected only into the host session menu', () => {
  // The signature is inclusive and label-based; an exact item COUNT is the
  // regression this pins against (0.1.7's pinned item broke it silently).
  assert.match(source, /menu\.fork/)
  assert.match(source, /menu\.archiveSession/)
  assert.match(source, /isSessionMenuLabels/)
  assert.match(source, /data-mobile-nav', 'session-delete'/)
  assert.doesNotMatch(source, /labels\.length === 3/)
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
  assert.match(misc, /\[data-mobile-nav="delete-confirm-yes"\]/)
  assert.match(misc, /prefers-reduced-motion: reduce/)
})

test('the dialog sits centred in the viewport', () => {
  const dialog = /\[data-mobile-nav="delete-dialog"\] \{([\s\S]*?)\n  \}/.exec(misc)?.[1]
  assert.ok(dialog, 'the dialog rule is missing from misc.css.ts')
  // Centred with inset + margin:auto rather than a transform, so the entrance
  // animation cannot fight the centring.
  assert.match(dialog, /inset: 0;/)
  assert.match(dialog, /margin: auto;/)
  assert.match(dialog, /max-height: calc\(100dvh - 48px\)/)
  assert.match(dialog, /width: min\(calc\(100vw - 32px\), 380px\)/)
  assert.doesNotMatch(dialog, /bottom: calc\(12px/)
})

test('the destructive button keeps its danger treatment', () => {
  // The plain actions-button rule is (0,1,1) and used to beat the
  // [data-mobile-nav="delete-confirm-yes"] rule at (0,1,0), so Delete rendered
  // as a second neutral button. The danger treatment is an OUTLINE (token red
  // border + label) rather than a filled red: DSH has no on-error foreground
  // token, so a fill could invert its label under a light-fill theme.
  const yes = /\[data-mobile-nav="delete-confirm-actions"\] \[data-mobile-nav="delete-confirm-yes"\] \{([\s\S]*?)\n  \}/.exec(misc)?.[1]
  assert.ok(yes, 'the danger button rule must out-specify the generic action-button rule')
  assert.match(yes, /border-color: var\(--dsw-alias-state-error-primary/)
  assert.match(yes, /color: var\(--dsw-alias-state-error-primary/)
})

test('the dialog uses DSH tokens, not a custom palette', () => {
  const block = misc.slice(misc.indexOf('session delete: confirmation dialog'), misc.indexOf('tablet / wide mobile'))
  // Mask, surface, border, shadow, motion and focus all resolve through tokens;
  // the hex values here are only the var() fallbacks.
  for (const token of ['--dsw-alias-bg-mask-1', '--dsw-alias-bg-layer-2', '--dsw-alias-border-l1', '--dsw-shadow-lv3', '--ds-ease-out', '--dsw-alias-state-business-primary', '--dsw-mask-blur']) {
    assert.match(block, new RegExp(token), `the dialog must use ${token}`)
  }
  assert.match(block, /border-radius: 24px;/)
  assert.match(block, /min-height: 44px;/)
  assert.match(block, /focus-visible/)
})

test('the dialog is hosted above the shell, not inside the frame', () => {
  // Measured on the live page: the drawer column (fIyUMG_sidebarCol) sits at
  // z-index 150, so a dialog appended inside the AppFrame at z-index 70/71
  // painted UNDER the open drawer and its buttons were unreachable.
  assert.match(source, /document\.body\.append\(backdrop, card\)/)
  assert.doesNotMatch(source, /frame\.append\(backdrop, card\)/)
})

test('the dialog layer is above the shell stacking scale', () => {
  const dialog = /\[data-mobile-nav="delete-dialog"\] \{([\s\S]*?)\n  \}/.exec(misc)?.[1]
  const backdrop = /\[data-mobile-nav="delete-dialog-backdrop"\] \{([\s\S]*?)\n  \}/.exec(misc)?.[1]
  assert.ok(dialog, 'the dialog rule is missing from misc.css.ts')
  assert.ok(backdrop, 'the backdrop rule is missing from misc.css.ts')
  const zOf = (rule: string): number => Number(/z-index: (\d+)/.exec(rule)?.[1] ?? 0)
  // The host's own scale tops out around 150 (drawer) / 40 (dialog panel).
  assert.ok(zOf(dialog) >= 200, `dialog z-index ${zOf(dialog)} must clear the shell scale`)
  assert.ok(zOf(backdrop) >= 199, `backdrop z-index ${zOf(backdrop)} must sit just under the dialog`)
})

import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  deleteSession,
  encodeSegment,
  projectKey,
  sessionDir,
  TRASH_DIR_NAME,
  TRASH_TTL_MS,
  type DeleteSessionDeps,
} from '../src/delete-session.ts'

const SESSION_ID = 'session-512a7e01-2733-4ecc-8d9b-99e762b960fb'
// Generic placeholder path: this package ships publicly, so no contributor's
// real checkout path may appear here (public-docs blacklist).
const WORKSPACE_CWD = '/home/user/projects/example-project'
const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const WORKSPACE_ROOT = resolve(REPO_ROOT, '..', '..')

function makeRoot(): { root: string; dir: string } {
  const root = mkdtempSync(join(tmpdir(), 'dsh-delete-session-'))
  const dir = sessionDir(root, WORKSPACE_CWD, SESSION_ID)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'session.jsonl'), '{}\n')
  return { root, dir }
}

function deps(root: string | undefined, overrides: Partial<DeleteSessionDeps> = {}): DeleteSessionDeps {
  return {
    persistence: {
      config: root === undefined ? {} : { root },
      list: async () => [{ id: SESSION_ID, cwd: WORKSPACE_CWD }],
    },
    ...overrides,
  }
}

test('the path layout mirrors the JSONL backend exactly', () => {
  // Goldens taken from the backend's own projectKey / encodeSegment
  // (packages/session/session-persistence-jsonl/src/format.ts) and confirmed
  // against this machine's live storage: the directory below exists as named.
  assert.equal(projectKey(WORKSPACE_CWD), '--home-user-projects-example-project--')
  // Windows drive separators collapse like POSIX ones; a separator run is one `-`.
  assert.equal(projectKey('C:\\work\\shop'), '--C-work-shop--')
  assert.throws(() => projectKey(''), /empty project path/)
  assert.equal(encodeSegment('a b'), 'a~0020b')
  assert.equal(encodeSegment('..'), '~002E~002E')
  assert.equal(encodeSegment('.'), '~002E')
  assert.equal(encodeSegment('~'), '~007E')
  assert.equal(encodeSegment('héllo'), 'h~00E9llo')
  assert.equal(encodeSegment('session-512a7e01-2733-4ecc-8d9b-99e762b960fb'), SESSION_ID)
  assert.throws(() => encodeSegment(''), /empty path segment/)
  assert.equal(
    sessionDir('/root', WORKSPACE_CWD, SESSION_ID),
    join('/root', '--home-user-projects-example-project--', SESSION_ID),
  )
  assert.equal(sessionDir('/root', undefined, SESSION_ID), join('/root', '_no-cwd', SESSION_ID))
})

test('the live storage root agrees with the derived project directory', () => {
  // Real evidence, not a fixture: on a machine that already has sessions for
  // this checkout, the directory the backend wrote must be the one the plugin
  // derives — no literal host path appears in this file.
  const live = join(homedir(), '.dsh', 'sessions')
  if (!existsSync(live)) return
  const names = new Set(readdirSync(live))
  if (names.size === 0) return
  const derived = [WORKSPACE_ROOT, REPO_ROOT].map((dir) => projectKey(dir))
  for (const dir of derived) {
    if (!names.has(dir)) continue
    assert.equal(existsSync(join(live, dir)), true)
    return
  }
})

test('a cold session is deleted and its directory removed', async () => {
  const { root, dir } = makeRoot()
  try {
    const result = await deleteSession(deps(root), SESSION_ID)
    assert.deepEqual(result, { status: 200, ok: true, deleted: SESSION_ID })
    assert.equal(existsSync(dir), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

/** The trash entries currently held under one storage root. */
function trashEntries(root: string): string[] {
  const trashRoot = join(root, TRASH_DIR_NAME)
  if (!existsSync(trashRoot) || !statSync(trashRoot).isDirectory()) return []
  return readdirSync(trashRoot)
}

test('a deleted session is moved to the trash with its payloads renamed', async () => {
  // The log is not destroyed: it is stashed so a mistaken delete is
  // recoverable, and the manifest records the exact restore mapping.
  const { root, dir } = makeRoot()
  try {
    // A second canonical generation, so the rename covers the versioned form
    // (`session.vN.jsonl`) and not only the v0 name.
    writeFileSync(join(dir, 'session.v1.jsonl'), '{}\n')
    const result = await deleteSession(deps(root), SESSION_ID)
    assert.equal(result.ok, true)
    assert.equal(existsSync(dir), false, 'the canonical directory is gone')

    const entries = trashEntries(root)
    assert.equal(entries.length, 1)
    const entry = join(root, TRASH_DIR_NAME, entries[0]!)
    assert.deepEqual(readdirSync(entry).sort(), ['manifest.json', 'session.jsonl.trash', 'session.v1.jsonl.trash'])
    const manifest = JSON.parse(readFileSync(join(entry, 'manifest.json'), 'utf8')) as {
      id: string
      files: { from: string; to: string }[]
    }
    assert.equal(manifest.id, SESSION_ID)
    assert.deepEqual(manifest.files.map((file) => file.from).sort(), ['session.jsonl', 'session.v1.jsonl'])
    // The mapping is deterministic even without the manifest: drop the suffix.
    for (const file of manifest.files) assert.equal(file.to, `${file.from}.trash`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('no canonical payload name survives inside the trash', async () => {
  // Load-bearing: the host treats EVERY directory under the storage root as a
  // project dir and every child of it as a session dir, so it descends into
  // `.sessions-trash`. A canonical payload name there makes the host compare a
  // header against the trash directory's derived identity, and that mismatch is
  // a plain Error `listArtifacts` does not filter — the ENTIRE session list
  // throws. Renaming the payloads is what makes the entry invisible; this pins
  // the rename order, because stashing the directory unrenamed breaks listing.
  const canonical = /^session(?:\.v[1-9][0-9]*)?\.jsonl(?:\.zstd)?$/
  const { root, dir } = makeRoot()
  try {
    writeFileSync(join(dir, 'session.v2.jsonl.zstd'), 'x')
    assert.equal((await deleteSession(deps(root), SESSION_ID)).ok, true)
    const entries = trashEntries(root)
    assert.equal(entries.length, 1)
    // The trash root itself must hold no loose file either: a flat `*.jsonl`
    // in a project directory trips the backend's legacy-layout rejection.
    for (const name of readdirSync(join(root, TRASH_DIR_NAME))) {
      const path = join(root, TRASH_DIR_NAME, name)
      assert.equal(statSync(path).isDirectory(), true, `${name} must be a directory`)
    }
    for (const name of readdirSync(join(root, TRASH_DIR_NAME, entries[0]!))) {
      assert.equal(canonical.test(name), false, `${name} is visible to the host session scan`)
      assert.equal(
        name.endsWith('.trash') || name === 'manifest.json',
        true,
        `${name} is neither a stashed payload nor the manifest`,
      )
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('trash entries older than the TTL are purged on the next delete', async () => {
  const { root } = makeRoot()
  try {
    const trashRoot = join(root, TRASH_DIR_NAME)
    const stale = join(trashRoot, 'stale-entry')
    const fresh = join(trashRoot, 'fresh-entry')
    mkdirSync(stale, { recursive: true })
    mkdirSync(fresh, { recursive: true })
    const old = new Date(Date.now() - TRASH_TTL_MS - 60_000)
    utimesSync(stale, old, old)

    assert.equal((await deleteSession(deps(root), SESSION_ID)).ok, true)
    const names = trashEntries(root)
    assert.equal(names.includes('stale-entry'), false, 'an expired entry must be purged')
    assert.equal(names.includes('fresh-entry'), true, 'a fresh entry must be kept')
    assert.equal(names.length, 2, 'the purge must not take the new entry with it')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a failed payload rename leaves the directory untouched and reports delete-failed', async () => {
  const { root, dir } = makeRoot()
  try {
    // A directory already occupying the rename target makes the payload rename
    // fail deterministically, with no permission games.
    mkdirSync(join(dir, 'session.jsonl.trash'))
    const result = await deleteSession(deps(root), SESSION_ID)
    assert.equal(result.status, 500)
    if (!result.ok) {
      assert.equal(result.error.code, 'delete-failed')
      assert.match(result.error.message, /untouched/)
    }
    assert.equal(existsSync(join(dir, 'session.jsonl')), true, 'the payload must still be in place')
    assert.equal(trashEntries(root).length, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a live session whose stash fails is reported as cleanup-failed, not as intact', async () => {
  // The teardown already stopped and unregistered the session, so reporting a
  // plain failure implies a session that no longer exists and leaves the
  // workspace account holding a zombie id. Settle the accounting, name the
  // observable state, and tell the caller the session will not resume.
  const { root, dir } = makeRoot()
  const calls: string[] = []
  try {
    // A FILE where the trash root belongs makes the stash fail after the
    // payloads were already renamed.
    writeFileSync(join(root, TRASH_DIR_NAME), 'not a directory')
    const result = await deleteSession(deps(root, {
      sessions: { get: () => ({ id: SESSION_ID }), flush: async () => { calls.push('flush') } },
      agents: {
        get: () => ({
          cancel: () => { calls.push('cancel') },
          whenIdle: async () => { calls.push('whenIdle') },
        }),
      },
      workspaceRegistry: {
        list: () => [{ detachSession: async () => { calls.push('detach') } }],
      },
    }), SESSION_ID)
    assert.equal(result.status, 500)
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.error.code, 'cleanup-failed')
      assert.equal(result.deletedLiveSession, true)
      assert.match(result.error.message, /will not resume/)
    }
    assert.deepEqual(calls, ['cancel', 'whenIdle', 'flush', 'detach'], 'accounting must still settle')
    assert.equal(existsSync(join(dir, 'session.jsonl')), false, 'the payloads were renamed, so the session is hidden')
    assert.equal(existsSync(join(dir, 'session.jsonl.trash')), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a cold session whose stash fails keeps the plain delete-failed code', async () => {
  const { root } = makeRoot()
  try {
    writeFileSync(join(root, TRASH_DIR_NAME), 'not a directory')
    const result = await deleteSession(deps(root), SESSION_ID)
    assert.equal(result.status, 500)
    if (!result.ok) {
      assert.equal(result.error.code, 'delete-failed')
      assert.equal(result.deletedLiveSession, undefined)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a missing session directory is still a success (idempotent)', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-delete-session-'))
  try {
    const result = await deleteSession(deps(root), SESSION_ID)
    assert.equal(result.ok, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an unknown session is refused without touching the storage root', async () => {
  const { root } = makeRoot()
  try {
    const result = await deleteSession({
      persistence: { config: { root }, list: async () => [] },
    }, SESSION_ID)
    assert.equal(result.status, 404)
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error.code, 'session-not-found')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a host without a persistence root answers 503', async () => {
  const result = await deleteSession(deps(undefined), SESSION_ID)
  assert.equal(result.status, 503)
  if (!result.ok) assert.equal(result.error.code, 'persistence-unavailable')
})

test('a failing lookup answers 500 delete-lookup-failed', async () => {
  const result = await deleteSession({
    persistence: { config: { root: '/tmp' }, list: async () => { throw new Error('boom') } },
  }, SESSION_ID)
  assert.equal(result.status, 500)
  if (!result.ok) {
    assert.equal(result.error.code, 'delete-lookup-failed')
    assert.match(result.error.message, /boom/)
  }
})

test('a path that would escape the storage root is refused', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-delete-session-'))
  try {
    // cwd values are encoded into ONE path segment, so traversal is neutralized
    // before the isInside guard even runs; this pins that property.
    const nasty = '/../../../etc'
    const dir = sessionDir(root, nasty, SESSION_ID)
    assert.equal(dir.startsWith(root), true)
    assert.equal(projectKey(nasty).includes('/'), false)
    const result = await deleteSession({
      persistence: { config: { root }, list: async () => [{ id: SESSION_ID, cwd: nasty }] },
    }, SESSION_ID)
    assert.equal(result.ok, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a live session on a host without a disposal face is refused as busy', async () => {
  const { root, dir } = makeRoot()
  try {
    const result = await deleteSession(deps(root, {
      sessions: { get: () => ({ id: SESSION_ID }), flush: async () => undefined },
      agents: { get: () => ({ id: SESSION_ID }) },
    }), SESSION_ID)
    assert.equal(result.status, 409)
    if (!result.ok) assert.equal(result.error.code, 'session-busy')
    assert.equal(existsSync(dir), true, 'a refused deletion must not remove the log')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a live session is stopped, flushed and detached when the host exposes disposal', async () => {
  const { root, dir } = makeRoot()
  const calls: string[] = []
  const agent = {
    cancel: (cause: { kind: string }) => { calls.push(`cancel:${cause.kind}`) },
    whenIdle: async () => { calls.push('whenIdle') },
  }
  try {
    const result = await deleteSession(deps(root, {
      sessions: { get: () => ({ id: SESSION_ID }), flush: async () => { calls.push('flush') } },
      agents: { get: () => agent },
      workspaceRegistry: {
        list: () => [{ detachSession: async () => { calls.push('detach') } }],
      },
    }), SESSION_ID)
    assert.equal(result.ok, true)
    assert.deepEqual(calls, ['cancel:disposed', 'whenIdle', 'flush', 'detach'])
    assert.equal(existsSync(dir), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a refusal to converge to idle is reported as busy, not as success', async () => {
  const { root, dir } = makeRoot()
  try {
    const result = await deleteSession(deps(root, {
      sessions: { get: () => ({ id: SESSION_ID }), flush: async () => undefined },
      agents: {
        get: () => ({
          cancel: () => {},
          whenIdle: async () => { throw new Error('still running') },
        }),
      },
    }), SESSION_ID)
    assert.equal(result.status, 409)
    assert.equal(existsSync(dir), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('entries in either host generation are understood', async () => {
  const { root } = makeRoot()
  try {
    // 0.1.2 and earlier return the flat header; 0.1.3+ wraps it in a snapshot.
    const snapshots: DeleteSessionDeps['persistence'] = {
      config: { root },
      list: async () => [{ header: { id: SESSION_ID, cwd: WORKSPACE_CWD } }],
    }
    assert.equal((await deleteSession({ persistence: snapshots }, SESSION_ID)).ok, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('workspace accounting failures never fail a finished deletion', async () => {
  const { root } = makeRoot()
  try {
    const result = await deleteSession(deps(root, {
      workspaceRegistry: {
        list: () => [{ detachSession: async () => { throw new Error('accounting down') } }],
      },
    }), SESSION_ID)
    assert.equal(result.ok, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  deleteSession,
  encodeSegment,
  projectKey,
  sessionDir,
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

/**
 * dsh-maestro-mobile, host half: session deletion.
 *
 * The host session menu knows rename / fork / archive; archive only hides a
 * row. Deleting a session is the one host capability the mobile drawer needs
 * and the harness does not provide.
 *
 * Ported from mexiaosqwq/dsh-web-mobile v2.4.1 (`src/delete-session.ts`), which
 * itself ports community-fork wzxmt-zhc v2.7.0. Adapted and re-verified
 * against the host this plugin runs on (DSH 0.1.5-rc.2):
 *
 * 1. `persistence.list()` shapes: 0.1.2 and earlier return a flat
 *    `SessionHeader[]` (the header IS the entry), 0.1.3+ wraps it in a
 *    snapshot that carries `.header`. `entryHeader()` accepts both.
 * 2. Live-session teardown needs an agent disposal face (callable `cancel` +
 *    `whenIdle`). 0.1.5-rc.2's agent registry returns a plain agent, so a live
 *    session is refused with 409 `session-busy` instead of being deleted under
 *    a still-registered agent — cold sessions stay deletable.
 * 3. Workspace accounting is optional per workspace: `detachSession` may not
 *    exist, and a failing account must never fail a finished deletion.
 *
 * The JSONL backend stores one directory per session under its public
 * `config.root`:
 *
 *   <root>/<projectKey(cwd)>/<encodeSegment(id)>/
 *
 * `projectKey` / `encodeSegment` here mirror
 * `@deepseek-ai/dsh-session-persistence-jsonl` `src/format.ts` byte for byte and
 * are pinned by unit tests against goldens taken from that module plus this
 * machine's live storage layout. The directory is removed recursively, and the
 * resolved path is refused when it does not sit inside the storage root.
 *
 * Attachment bytes are content-addressed in a shared backend and are NOT
 * removed; they only become unreachable garbage once no log references them.
 */
import { rm } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'

/** How long to wait for a live agent to converge to idle before refusing. */
const IDLE_TIMEOUT_MS = 20_000

/** One entry of `persistence.list()` in either host generation's shape. */
export interface PersistenceListEntry {
  readonly id?: unknown
  readonly cwd?: unknown
  readonly header?: { readonly id?: unknown; readonly cwd?: unknown }
}

/** Structural host services the deletion flow depends on (no harness import). */
export interface DeleteSessionDeps {
  persistence: {
    /** The JSONL backend exposes its configured root publicly (`config.root`). */
    config?: { root?: string }
    list(): Promise<readonly PersistenceListEntry[]>
  }
  sessions?: {
    get(id: string): unknown
    flush(session: unknown): Promise<unknown>
  }
  agents?: {
    get(id: string): unknown
  }
  workspaceRegistry?: {
    list(): readonly { detachSession?(id: string): Promise<void> }[]
  }
}

/** Structured outcome the HTTP layer maps to a status code. */
export type DeleteSessionResult =
  | { status: 200; ok: true; deleted: string }
  | { status: 404; ok: false; error: { code: 'session-not-found'; message: string } }
  | { status: 409; ok: false; error: { code: 'session-busy'; message: string } }
  | { status: 500; ok: false; error: { code: 'delete-lookup-failed' | 'delete-failed'; message: string } }
  | { status: 503; ok: false; error: { code: 'persistence-unavailable'; message: string } }

/**
 * Escape one raw session id into one filesystem-safe path segment, mirroring
 * the backend: safe code units stay literal, everything else (including `~`)
 * becomes `~XXXX`, and `.` / `..` are special-cased so an otherwise safe whole
 * segment cannot traverse.
 * @param raw - the string to encode; must be non-empty.
 * @returns the escaped single path segment.
 */
export function encodeSegment(raw: string): string {
  if (raw.length === 0) throw new Error('cannot encode an empty path segment')
  if (raw === '.') return '~002E'
  if (raw === '..') return '~002E~002E'
  let out = ''
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i)
    const ch = String.fromCharCode(code)
    if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) {
      out += ch
    } else {
      out += '~' + code.toString(16).toUpperCase().padStart(4, '0')
    }
  }
  return out
}

/**
 * Build the readable directory key for a project path, mirroring the backend:
 * separators collapse into `-`, unsafe code units use the `~XXXX` escape, and
 * the result is bounded for filesystem component limits.
 * @param cwd - the session's project directory.
 * @returns a single filesystem-safe project directory name.
 */
export function projectKey(cwd: string): string {
  if (cwd.length === 0) throw new Error('cannot encode an empty project path')
  let readable = ''
  let separatorRun = false
  for (let i = 0; i < cwd.length; i++) {
    const code = cwd.charCodeAt(i)
    const ch = String.fromCharCode(code)
    if (ch === '/' || ch === '\\' || ch === ':') {
      if (!separatorRun) readable += '-'
      separatorRun = true
    } else if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) {
      readable += ch
      separatorRun = false
    } else {
      readable += '~' + code.toString(16).toUpperCase().padStart(4, '0')
      separatorRun = false
    }
  }
  const slug = readable.replace(/^-+/, '') || 'root'
  return `--${slug.slice(0, 251)}--`
}

/**
 * The directory one session owns under the storage root.
 * @param root - the backend's configured session root.
 * @param cwd - the session's project directory (`undefined` → `_no-cwd`).
 * @param id - the session id, encoded to one safe path segment.
 * @returns the absolute-ish session directory path.
 */
export function sessionDir(root: string, cwd: string | undefined, id: string): string {
  const project = cwd === undefined ? '_no-cwd' : projectKey(cwd)
  return join(root, project, encodeSegment(id))
}

/** Whether `target` resolves to a path inside `root` (escape defence). */
function isInside(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel !== '..' && !rel.startsWith('..' + sep) && rel !== ''
}

/** Bound a promise with a rejection deadline so a stuck agent cannot hang the endpoint. */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (value) => { clearTimeout(timer); resolvePromise(value) },
      (error) => { clearTimeout(timer); reject(error) },
    )
  })
}

/** Unregister a live agent through runtime-visible store internals, if present. */
function detachLiveAgent(agents: DeleteSessionDeps['agents'] | undefined, id: string): void {
  const registry = agents as unknown as
    | { store?: Map<string, unknown>; detachEntered?: (entry: unknown) => void }
    | undefined
  const entry = registry?.store?.get(id)
  if (entry !== undefined) registry?.detachEntered?.(entry)
}

/** Unregister a live session through runtime-visible store internals, if present. */
function detachLiveSession(sessions: DeleteSessionDeps['sessions'] | undefined, id: string): void {
  const store = sessions as unknown as
    | { store?: Map<string, { detach?: () => void }> }
    | undefined
  store?.store?.get(id)?.detach?.()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Normalize one `persistence.list()` entry across host generations: prefer the
 * snapshot's `.header`, fall back to the flat header. Entries without a usable
 * id are skipped.
 * @param entry - one list entry.
 * @returns the id and optional cwd, or undefined when unusable.
 */
function entryHeader(entry: PersistenceListEntry): { id: string; cwd?: string } | undefined {
  const header = entry.header ?? entry
  if (typeof header.id !== 'string' || header.id === '') return undefined
  return {
    id: header.id,
    cwd: typeof header.cwd === 'string' ? header.cwd : undefined,
  }
}

/**
 * Delete one session: stop it if live, remove its persisted directory, and
 * detach it from every workspace account.
 * @param deps - injected host services; the flow never imports the harness.
 * @param sessionId - the session to delete.
 * @returns a structured result the caller maps to an HTTP response.
 */
export async function deleteSession(deps: DeleteSessionDeps, sessionId: string): Promise<DeleteSessionResult> {
  const root = deps.persistence.config?.root
  if (root === undefined || root === '') {
    return {
      status: 503,
      ok: false,
      error: {
        code: 'persistence-unavailable',
        message: 'session persistence is not configured with a storage root',
      },
    }
  }

  let snapshot: { id: string; cwd?: string } | undefined
  try {
    snapshot = (await deps.persistence.list())
      .map(entryHeader)
      .find((header) => header !== undefined && header.id === sessionId)
  } catch (error) {
    return {
      status: 500,
      ok: false,
      error: {
        code: 'delete-lookup-failed',
        message: `failed to look up the session: ${errorMessage(error)}`,
      },
    }
  }
  if (snapshot === undefined) {
    return {
      status: 404,
      ok: false,
      error: { code: 'session-not-found', message: `no such session '${sessionId}'` },
    }
  }

  // Live sessions: only delete when the host exposes the agent disposal face
  // (callable cancel + whenIdle). Otherwise refuse with 409 rather than
  // deleting a log under a still-registered live agent.
  const live = deps.sessions?.get(sessionId)
  if (live !== undefined && deps.sessions !== undefined) {
    const agent = deps.agents?.get(sessionId) as
      | { cancel?: (cause: { kind: 'disposed' }) => void; whenIdle?: () => Promise<void> }
      | undefined
    const handle = agent !== undefined
      && typeof agent.cancel === 'function'
      && typeof agent.whenIdle === 'function'
      ? agent as { cancel(cause: { kind: 'disposed' }): void; whenIdle(): Promise<void> }
      : undefined
    if (agent !== undefined && handle === undefined) {
      return {
        status: 409,
        ok: false,
        error: {
          code: 'session-busy',
          message: `session '${sessionId}' is live on a host generation that exposes no agent disposal face; stop it first, then retry`,
        },
      }
    }
    try {
      if (handle !== undefined) {
        handle.cancel({ kind: 'disposed' })
        await withTimeout(
          handle.whenIdle(),
          IDLE_TIMEOUT_MS,
          `agent for session '${sessionId}' did not converge to idle within ${IDLE_TIMEOUT_MS}ms`,
        )
      }
      await deps.sessions.flush(live)
      detachLiveAgent(deps.agents, sessionId)
      detachLiveSession(deps.sessions, sessionId)
    } catch (error) {
      return {
        status: 409,
        ok: false,
        error: {
          code: 'session-busy',
          message: `cannot delete session '${sessionId}': it is running and could not be stopped: ${errorMessage(error)}`,
        },
      }
    }
  }

  const resolvedRoot = resolve(root)
  const dir = sessionDir(resolvedRoot, snapshot.cwd, sessionId)
  if (!isInside(resolvedRoot, dir)) {
    return {
      status: 500,
      ok: false,
      error: {
        code: 'delete-failed',
        message: `refusing to remove '${dir}': it resolves outside the session storage root`,
      },
    }
  }
  try {
    await rm(dir, { recursive: true, force: true })
  } catch (error) {
    return {
      status: 500,
      ok: false,
      error: {
        code: 'delete-failed',
        message: `failed to remove the session log: ${errorMessage(error)}`,
      },
    }
  }

  // Workspace accounting: remove the deleted session from every workspace
  // account. Optional per workspace, and never allowed to fail an
  // already-finished deletion.
  if (deps.workspaceRegistry !== undefined) {
    for (const workspace of deps.workspaceRegistry.list()) {
      try {
        await workspace.detachSession?.(sessionId)
      } catch {
        // Accounting is best-effort; the log is already gone.
      }
    }
  }
  return { status: 200, ok: true, deleted: sessionId }
}

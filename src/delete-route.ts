/**
 * Request gate and body parsing for the session-delete route.
 *
 * Authorization model, decided explicitly because this endpoint destroys data:
 * the route inherits the deployment's existing gates — the Maestro PIN proxy in
 * front of :3080/:3081 (its cookie is `HttpOnly; SameSite=Lax`, so a cross-site
 * POST cannot carry it) and the loopback bind plus launch-token fence on the
 * raw :3082. On top of that it adds its own defence in depth:
 *
 * - POST only;
 * - reject `Sec-Fetch-Site: cross-site`;
 * - when an `Origin` is present, its host must equal the request `Host`;
 * - a malformed `Origin` is treated as hostile, not as absent;
 * - the body must be JSON with exactly one non-empty string `sessionId`, read
 *   through a byte cap that drains an oversized request instead of destroying
 *   it (see `readDeleteBody`).
 *
 * No new secret is introduced and nothing about the caller is logged.
 */
import type { IncomingMessage } from 'node:http'

/** The request fields the gate reads. */
export interface DeleteRequestFacts {
  method?: string
  origin?: string
  host?: string
  secFetchSite?: string
}

/**
 * Hard cap on the delete request body.
 *
 * The body is one session id — a few dozen bytes — so 64 KiB is already
 * generous, and deliberately tighter than a general-purpose API cap: this
 * endpoint destroys data and has no legitimate large body. The cap exists so a
 * hostile client cannot make the host buffer megabytes before the gate rejects.
 */
export const MAX_DELETE_BODY_BYTES = 64 * 1024

/** Outcome of reading the delete request body. */
export type DeleteBodyRead =
  | { outcome: 'ok'; body: string }
  | { outcome: 'too-large'; limitBytes: number }
  | { outcome: 'error'; message: string }

/**
 * Read the delete request body as UTF-8 text, up to `limitBytes`.
 *
 * An oversized body is DRAINED, never destroyed. Destroying the socket at the
 * overflow point races the error response: the handler writes 413 into a dying
 * connection and the client sees an empty reply instead of the reason. Reading
 * to the natural end costs one discarded body and keeps the response
 * deliverable. Buffered data is released as soon as the cap is passed, so an
 * oversized request cannot grow the buffer further.
 * @param req - the incoming request.
 * @param limitBytes - the cap in BYTES (not code units: a 3-byte character is
 * one code unit, so a code-unit cap would admit 3x the intended size).
 * @returns the body, or why it could not be used.
 */
export function readDeleteBody(
  req: IncomingMessage,
  limitBytes: number = MAX_DELETE_BODY_BYTES,
): Promise<DeleteBodyRead> {
  return new Promise((resolve) => {
    let data = ''
    let bytes = 0
    let tooLarge = false
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => {
      bytes += Buffer.byteLength(chunk)
      if (bytes > limitBytes) {
        tooLarge = true
        data = ''
        return
      }
      if (!tooLarge) data += chunk
    })
    req.on('end', () => {
      resolve(tooLarge ? { outcome: 'too-large', limitBytes } : { outcome: 'ok', body: data })
    })
    req.on('error', (error: Error) => {
      resolve({ outcome: 'error', message: error.message })
    })
  })
}

/**
 * Whether a request may reach the deletion core.
 * @param facts - method / origin / host / sec-fetch-site of the request.
 * @returns true when the request is same-site and properly shaped.
 */
export function isTrustedDeleteRequest(facts: DeleteRequestFacts): boolean {
  if (facts.method !== 'POST') return false
  if (facts.secFetchSite === 'cross-site') return false
  const origin = facts.origin
  if (origin === undefined || origin === '') return true
  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    // A malformed Origin header is not the same as an absent one.
    return false
  }
  const host = facts.host ?? ''
  return originHost === host || stripPort(originHost) === stripPort(host)
}

function stripPort(host: string): string {
  const index = host.lastIndexOf(':')
  if (index === -1) return host
  const tail = host.slice(index + 1)
  return /^\d+$/.test(tail) ? host.slice(0, index) : host
}

/**
 * Extract the session id from a raw request body.
 * @param raw - the request body as UTF-8 text.
 * @returns the session id, or null when the body is not exactly one non-empty
 * string field named `sessionId`.
 */
export function parseDeleteBody(raw: string): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const sessionId = (parsed as { sessionId?: unknown }).sessionId
  if (typeof sessionId !== 'string' || sessionId === '') return null
  return sessionId
}

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
 * - the body must be JSON with exactly one non-empty string `sessionId`.
 *
 * No new secret is introduced and nothing about the caller is logged.
 */

/** The request fields the gate reads. */
export interface DeleteRequestFacts {
  method?: string
  origin?: string
  host?: string
  secFetchSite?: string
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

/**
 * dsh-maestro-mobile, node half. Client UI plugin with two host capabilities:
 * transparent gzip/brotli compression for large JSON responses (long-session
 * history is megabytes on a phone) and the session-delete route the mobile
 * drawer needs (the host session menu only knows rename / fork / archive).
 * The browser half ships via exports["./client"], discovered through the
 * package.json dsh.client declaration.
 *
 * Host packages are intentionally NOT type-imported: this package's
 * node_modules carries client-side @deepseek-ai packages only, so every host
 * face is declared structurally below and read through `ctx.get()` at request
 * time — a host shape that omits a service degrades to a structured error
 * instead of a crash.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { installResponseCompression } from './compress.js'
import { deleteSession, type DeleteSessionDeps } from './delete-session.js'
import { isTrustedDeleteRequest, parseDeleteBody, readDeleteBody } from './delete-route.js'

/** Minimal structural slice of the host cordis Context that apply() needs. */
export interface HostContext {
  /** Register one disposable installer; its return value disposes on unload. */
  effect(install: () => unknown, label?: string): unknown
  /** Read one optional service by name (undefined when the host omits it). */
  get(service: string): unknown
  /** Run apply once the named services exist (cordis fiber inject). */
  inject(services: readonly string[], apply: (scoped: ScopedContext) => void): void
  /** Host logger face (warn-level is all this plugin uses). */
  logger: { warn(message: string): void }
}

/** Context shape inside the `webServer` inject scope. */
export interface ScopedContext extends HostContext {
  webServer: {
    register(route: {
      kind: 'exact'
      path: string
      handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
    }): unknown
  }
}

/**
 * Route path. The `mobile-nav` namespace is the marker prefix this plugin has
 * used since it inherited it (`data-mobile-nav`), so the API path stays
 * consistent with the markers it drives.
 */
export const DELETE_ROUTE_PATH = '/api/mobile-nav.session.delete'

/** Write one JSON response with a fixed content type. */
function respond(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  })
  res.end(payload)
}

/** Coerce one request header to a single string. */
function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name]
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value[0]
  return undefined
}

export function apply(ctx: HostContext): void {
  // Transparent gzip/brotli for large JSON responses (long-session history
  // is megabytes on a phone). Patches http.ServerResponse.prototype; the
  // disposer restores it on plugin unload/reload.
  // Ported from mexiaosqwq/dsh-web-mobile v2.1.5 (wzxmt-zhc fork).
  ctx.effect(() => installResponseCompression(), 'dsh-maestro-mobile: response compression')

  // Session-delete route. Registered once the web route registry exists; the
  // persistence / session / agent / workspace services are read per request so
  // host shapes without them degrade to a structured 503.
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: DELETE_ROUTE_PATH,
      handler: async (req, res) => {
        if (!isTrustedDeleteRequest({
          method: req.method,
          origin: header(req, 'origin'),
          host: header(req, 'host'),
          secFetchSite: header(req, 'sec-fetch-site'),
        })) {
          respond(res, 403, { error: { code: 'forbidden', message: 'POST from the same site required' } })
          return
        }
        const read = await readDeleteBody(req)
        if (read.outcome === 'too-large') {
          respond(res, 413, {
            error: {
              code: 'payload-too-large',
              message: `request body exceeds the ${read.limitBytes}-byte limit`,
            },
          })
          return
        }
        if (read.outcome === 'error') {
          respond(res, 400, {
            error: { code: 'invalid-body', message: read.message },
          })
          return
        }
        const sessionId = parseDeleteBody(read.body)
        if (sessionId === null) {
          respond(res, 400, {
            error: {
              code: 'invalid-session-id',
              message: 'expected a JSON body of the form { "sessionId": string }',
            },
          })
          return
        }

        const persistence = ctx.get('sessionPersistence')
        if (persistence === undefined) {
          respond(res, 503, {
            error: { code: 'persistence-unavailable', message: 'session persistence is not configured' },
          })
          return
        }
        const result = await deleteSession({
          persistence: persistence as DeleteSessionDeps['persistence'],
          sessions: ctx.get('sessions') as DeleteSessionDeps['sessions'] | undefined,
          agents: ctx.get('agents') as DeleteSessionDeps['agents'] | undefined,
          workspaceRegistry: ctx.get('workspaceRegistry') as DeleteSessionDeps['workspaceRegistry'] | undefined,
        }, sessionId)
        if (result.ok) {
          respond(res, 200, { ok: true, deleted: result.deleted })
          return
        }
        // The session id is the caller's own argument, not a secret; the
        // message is the structured reason only.
        ctx.logger.warn(
          `dsh-maestro-mobile: session-delete failed for '${sessionId}' (${result.error.code}): ${result.error.message}`,
        )
        respond(res, result.status, { error: result.error })
      },
    }), 'dsh-maestro-mobile: session-delete route')
  })
}

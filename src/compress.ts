/**
 * Transparent response compression for large JSON payloads.
 *
 * Long sessions make `session.history` responses megabytes of JSON; on a
 * phone that is a slow, data-hungry transfer. This module patches
 * `http.ServerResponse.prototype` (process-wide, restored on dispose) so any
 * JSON response the host serves — the harness's own `/api/*` routes included —
 * is compressed when the client accepts it:
 *
 * - The client's `Accept-Encoding` picks the codec: `br` (brotli, quality 6)
 *   preferred, `gzip` fallback.
 * - Only JSON responses of at least MIN_JSON_BYTES are compressed; small
 *   JSON and every other content type (HTML, static assets, ZIP, SSE streams)
 *   pass through byte-identical with the original headers.
 * - The response header write is deferred until the body is known, so the
 *   decision (compress or not) is made on the actual size, and `Content-Length`
 *   always matches what is sent. Non-JSON responses call the original
 *   `writeHead` immediately and are never touched.
 *
 * The browser's fetch decompresses transparently, so no client change is
 * needed. SSE (`text/event-stream`) is intentionally left uncompressed: it is
 * a continuous stream and the /api bridge never buffers it.
 *
 * Deferring means replaying the caller's `end()` later, so the argument list
 * has to be classified rather than forwarded: a function argument is always a
 * completion callback (never body data — `end(cb)` carries no body at all), an
 * encoding argument is consumed by the buffering, and a buffered `write()`'s
 * completion callback is replayed once, in order, right after the real `end()`.
 * Forwarding the tail blindly appends the callback's own source text or the
 * literal encoding name to the response.
 *
 * Known limitations: while a response is deferred, `write()` answers `true`
 * unconditionally — the socket is untouched, so there is no backpressure signal
 * to report — and a buffered `write()` callback cannot be failed individually
 * by the real `end()` that replays it.
 *
 * Ported from community fork wzxmt-zhc/dsh-web-mobile (v2.5.0).
 */
import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib'
import { ServerResponse as NodeServerResponse } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'

/** Only payloads at least this large are worth compressing. */
const MIN_JSON_BYTES = 4 * 1024

/** Brotli quality: 6 balances size and CPU for large JSON (17MB → ~1MB). */
const BROTLI_QUALITY = 6

/** One deferred response: headers held back until the body size is known. */
export interface DeferredResponse {
  /** Original writeHead argument list (status/message/headers) to replay. */
  writeHeadArgs: unknown[]
  /** Original headers object carried by writeHeadArgs. */
  headers: Record<string, string | number | string[]>
  /** Codec chosen from the request's Accept-Encoding. */
  encoding: 'br' | 'gzip'
  /** Buffered body chunks. */
  chunks: Buffer[]
  /** `write()` completion callbacks buffered while the response is deferred. */
  writeCallbacks: Array<() => void>
}

/** Per-response state; only present while a JSON response is being deferred. */
const deferred = new WeakMap<ServerResponse, DeferredResponse>()

/** Choose the codec the client accepts; `br` outranks `gzip`. */
function pickEncoding(res: ServerResponse): 'br' | 'gzip' | null {
  const accepted = (res.req as IncomingMessage | undefined)?.headers['accept-encoding'] ?? ''
  if (/\bbr\b/.test(accepted)) return 'br'
  if (/\bgzip\b/.test(accepted)) return 'gzip'
  return null
}

/**
 * Find a header value regardless of the caller's key casing. The patch sees
 * the RAW writeHead argument (before Node lowercases), and HTTP header names
 * are case-insensitive — a caller may pass `Content-Type` or `content-type`.
 * @param headers - the raw headers object handed to writeHead.
 * @param name - the lowercased header name to look up.
 * @returns the value as a string, or undefined when absent.
 */
export function headerValue(headers: Record<string, string | number | string[]>, name: string): string | undefined {
  const wanted = name.toLowerCase()
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === wanted) return String(headers[key])
  }
  return undefined
}

/** Whether a response warrants deferred (potentially compressed) handling. */
export function isDeferrable(headers: Record<string, string | number | string[]>): boolean {
  if (headerValue(headers, 'content-encoding') !== undefined) return false
  const contentType = headerValue(headers, 'content-type') ?? ''
  return contentType.includes('json')
}

/** Append the Accept-Encoding Vary token without clobbering an existing Vary. */
export function varyWithAcceptEncoding(headers: Record<string, string | number | string[]>): void {
  const existingKey = Object.keys(headers).find((key) => key.toLowerCase() === 'vary')
  if (existingKey === undefined) {
    headers['vary'] = 'Accept-Encoding'
  } else {
    headers[existingKey] = `${String(headers[existingKey])}, Accept-Encoding`
  }
}

/** Buffer one body chunk for a deferred response, honouring the caller's encoding. */
export function bufferChunk(pending: DeferredResponse, chunk: unknown, encoding?: BufferEncoding): void {
  if (typeof chunk === 'string') pending.chunks.push(Buffer.from(chunk, encoding))
  else if (chunk instanceof Uint8Array) pending.chunks.push(Buffer.from(chunk))
  else if (chunk !== null && chunk !== undefined) pending.chunks.push(Buffer.from(String(chunk)))
}

/**
 * Fire the buffered `write()` completion callbacks once, in order.
 *
 * The real `end()` cannot fail a buffered write's callback individually, so
 * they replay together right after it. They are never invoked while deferred:
 * the socket is untouched until then, so a callback fired earlier would report
 * a completion that has not happened.
 */
function fireWriteCallbacks(pending: DeferredResponse): void {
  for (const callback of pending.writeCallbacks.splice(0)) callback()
}

/** Replay the stored writeHead args with a replacement headers object. */
function writeHeadWith(res: ServerResponse, origWriteHead: (...args: unknown[]) => ServerResponse, pending: DeferredResponse, headers: Record<string, string | number | string[]>): ServerResponse {
  const args = pending.writeHeadArgs.slice() as unknown[]
  if (typeof args[1] === 'string') args[2] = headers
  else args[1] = headers
  // Keep the receiver: node's writeHead reads this._header etc.
  return origWriteHead.apply(res, args) as ServerResponse
}

/**
 * Install the compression patch on http.ServerResponse.prototype.
 * @returns disposer restoring the original methods (plugin reload safety).
 */
export function installResponseCompression(): () => void {
  const proto = NodeServerResponse.prototype
  // Capture the originals under the simple signatures the wrappers use; the
  // real overloaded implementations are restored unchanged on dispose.
  const origWriteHead = proto.writeHead as (...args: unknown[]) => ServerResponse
  const origWrite = proto.write as (chunk: unknown, ...rest: unknown[]) => boolean
  const origEnd = proto.end as (chunk?: unknown, ...rest: unknown[]) => ServerResponse

  function patchedWriteHead(this: ServerResponse, ...args: unknown[]): ServerResponse {
    const rawHeaders = typeof args[1] === 'string' ? args[2] : args[1]
    const headers = rawHeaders as Record<string, string | number | string[]> | undefined
    if (headers === undefined || !isDeferrable(headers)) {
      return origWriteHead.apply(this, args as never) as ServerResponse
    }
    const encoding = pickEncoding(this)
    if (encoding === null) {
      return origWriteHead.apply(this, args as never) as ServerResponse
    }
    // Hold the header write until the body size is known (see module doc).
    deferred.set(this, { writeHeadArgs: args, headers, encoding, chunks: [], writeCallbacks: [] })
    return this
  }

  function patchedWrite(this: ServerResponse, chunk: unknown, ...rest: unknown[]): boolean {
    const pending = deferred.get(this)
    if (pending !== undefined) {
      // The caller's encoding is part of the payload: a latin1 chunk
      // re-encoded as UTF-8 changes its bytes.
      bufferChunk(pending, chunk, typeof rest[0] === 'string' ? rest[0] as BufferEncoding : undefined)
      for (const arg of rest) {
        if (typeof arg === 'function') pending.writeCallbacks.push(arg as () => void)
      }
      // The socket is untouched while deferred, so no backpressure signal
      // exists to report: write() answers true unconditionally.
      return true
    }
    return origWrite.apply(this, [chunk, ...rest] as never) as boolean
  }

  function patchedEnd(this: ServerResponse, chunk?: unknown, ...rest: unknown[]): ServerResponse {
    const pending = deferred.get(this)
    if (pending === undefined) {
      return chunk === undefined
        ? origEnd.apply(this, rest as never) as ServerResponse
        : origEnd.apply(this, [chunk, ...rest] as never) as ServerResponse
    }
    deferred.delete(this)
    // A function argument is ALWAYS a completion callback, never body data:
    // `end(cb)` carries no body at all, and treating the function as data
    // appends its own source text to the response while dropping the callback.
    // An encoding argument, when present, is consumed by the buffering below —
    // replaying it into the real end() writes the token itself into the body.
    const callbacks = (typeof chunk === 'function' ? [chunk, ...rest] : rest)
      .filter((arg): arg is () => void => typeof arg === 'function')
    if (chunk !== undefined && typeof chunk !== 'function') {
      bufferChunk(pending, chunk, typeof rest[0] === 'string' ? rest[0] as BufferEncoding : undefined)
    }
    const body = Buffer.concat(pending.chunks)

    // Small or empty JSON: replay the ORIGINAL header write and body verbatim
    // (no Content-Encoding, original Content-Length intact).
    if (body.byteLength < MIN_JSON_BYTES) {
      writeHeadWith(this, origWriteHead, pending, pending.headers)
      const ended = body.byteLength === 0
        ? origEnd.apply(this, callbacks as never) as ServerResponse
        : origEnd.apply(this, [body, ...callbacks] as never) as ServerResponse
      fireWriteCallbacks(pending)
      return ended
    }

    // Large JSON: compress and rewrite the length-bearing headers.
    const compressed = pending.encoding === 'br'
      ? brotliCompressSync(body, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY } })
      : gzipSync(body, { level: 6 })
    const headers = { ...pending.headers }
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === 'content-length') delete headers[key]
    }
    headers['content-encoding'] = pending.encoding
    headers['content-length'] = compressed.byteLength
    varyWithAcceptEncoding(headers)
    writeHeadWith(this, origWriteHead, pending, headers)
    origWrite.call(this, compressed)
    const ended = origEnd.apply(this, callbacks as never) as ServerResponse
    fireWriteCallbacks(pending)
    return ended
  }

  proto.writeHead = patchedWriteHead
  proto.write = patchedWrite
  proto.end = patchedEnd

  return () => {
    if (proto.writeHead === patchedWriteHead) proto.writeHead = origWriteHead
    if (proto.write === patchedWrite) proto.write = origWrite
    if (proto.end === patchedEnd) proto.end = origEnd
  }
}

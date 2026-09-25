import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { connect } from 'node:net'
import { gunzipSync } from 'node:zlib'
import test from 'node:test'

import { bufferChunk, installResponseCompression, type DeferredResponse } from '../src/compress.ts'

/**
 * The response patch defers a JSON body until its size is known, then replays
 * the real `end()`. Replaying means deciding what part of the `end()` argument
 * list is BODY and what part is a completion callback — get that wrong and the
 * callback's own source text is written into the response, or the callback is
 * silently dropped.
 *
 * These tests drive a real HTTP server through the patch, because the failure
 * modes only exist once Node's own `ServerResponse` is in the chain: the unit
 * helpers below cannot see them.
 */

type Handler = (req: IncomingMessage, res: ServerResponse) => void

/** Serve one handler with the patch installed, for the duration of `run`. */
async function withServer<T>(handler: Handler, run: (port: number) => Promise<T>): Promise<T> {
  const dispose = installResponseCompression()
  const server = createServer(handler)
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('the test server has no port')
  try {
    return await run(address.port)
  } finally {
    await new Promise<void>((resolve) => { server.close(() => resolve()) })
    dispose()
  }
}

/** Fetch one response through the patch, decompressed by the HTTP client. */
async function roundTrip(
  handler: Handler,
): Promise<{ text: string; contentEncoding: string | null; contentLength: number | null }> {
  return withServer(handler, async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/`, {
      headers: { 'accept-encoding': 'gzip' },
    })
    const contentLength = response.headers.get('content-length')
    return {
      text: await response.text(),
      contentEncoding: response.headers.get('content-encoding'),
      contentLength: contentLength === null ? null : Number(contentLength),
    }
  })
}

/**
 * Read the response over a raw socket, so NOTHING the server wrote is hidden.
 * The HTTP client stops at `content-length`, which would mask bytes written
 * after the payload — exactly the defect these tests exist to catch.
 */
async function rawRoundTrip(handler: Handler): Promise<{ headers: Record<string, string>; body: Buffer }> {
  return withServer(handler, async (port) => new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const socket = connect(port, '127.0.0.1', () => {
      socket.write('GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nAccept-Encoding: gzip\r\nConnection: close\r\n\r\n')
    })
    socket.on('data', (chunk: Buffer) => chunks.push(chunk))
    socket.on('error', reject)
    socket.on('end', () => {
      const raw = Buffer.concat(chunks)
      const split = raw.indexOf('\r\n\r\n')
      const headers: Record<string, string> = {}
      for (const line of raw.subarray(0, split).toString('latin1').split('\r\n').slice(1)) {
        const at = line.indexOf(':')
        if (at > 0) headers[line.slice(0, at).toLowerCase()] = line.slice(at + 1).trim()
      }
      resolve({ headers, body: raw.subarray(split + 4) })
    })
  }))
}

const LARGE_JSON = JSON.stringify({ data: 'x'.repeat(8192) })

test('end(callback) fires the callback and writes no body', async () => {
  // `end(cb)` carries no body at all. Treating the function as data appends its
  // own source text to the response and never calls it.
  let called = 0
  const { text } = await roundTrip((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(() => { called += 1 })
  })
  assert.equal(text, '', 'the response body must be empty')
  assert.equal(called, 1, 'the completion callback must fire exactly once')
})

test('end(data, callback) delivers the data and fires the callback', async () => {
  let called = 0
  const { text } = await roundTrip((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(LARGE_JSON, () => { called += 1 })
  })
  assert.equal(called, 1)
  assert.equal(text, LARGE_JSON)
})

test('end(data, encoding) does not ship the encoding as body data', async () => {
  // `end(data, 'utf8')` — replaying the rest-args into the original end() writes
  // the literal string "utf8" as a SECOND body chunk after the compressed
  // payload. The client hides it (it stops at content-length), so this reads the
  // raw socket: the response must carry exactly the bytes it declares.
  let called = 0
  const { headers, body } = await rawRoundTrip((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(LARGE_JSON, 'utf8', () => { called += 1 })
  })
  assert.equal(called, 1)
  assert.equal(headers['content-encoding'], 'gzip')
  assert.equal(
    body.length,
    Number(headers['content-length']),
    'the encoding token must never be written as extra body bytes',
  )
  assert.equal(gunzipSync(body).toString('utf8'), LARGE_JSON)
})

test('write(chunk) callbacks are replayed after the real end()', async () => {
  const order: string[] = []
  const { text } = await roundTrip((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.write(LARGE_JSON.slice(0, 4000), () => { order.push('write-callback') })
    res.end(LARGE_JSON.slice(4000), () => { order.push('end-callback') })
  })
  assert.equal(text, LARGE_JSON)
  // The real end() cannot fail a buffered write's callback individually, so the
  // callbacks replay in order right after it — and they must not be lost.
  assert.deepEqual(order, ['write-callback', 'end-callback'])
})

test('a small JSON body still passes through uncompressed', async () => {
  const { text, contentEncoding } = await roundTrip((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end('{"ok":true}')
  })
  assert.equal(text, '{"ok":true}')
  assert.equal(contentEncoding, null)
})

test('bufferChunk keeps a latin1 chunk in the encoding the caller named', () => {
  // Re-encoding a latin1 chunk as UTF-8 changes its bytes: "é" is one byte in
  // latin1 and two in UTF-8, so the caller's encoding is part of the payload.
  const pending: DeferredResponse = {
    writeHeadArgs: [],
    headers: {},
    encoding: 'gzip',
    chunks: [],
    writeCallbacks: [],
  }
  bufferChunk(pending, 'é', 'latin1')
  assert.equal(pending.chunks.length, 1)
  assert.equal(pending.chunks[0]?.length, 1, 'a latin1 chunk must not be widened to UTF-8')
  assert.equal(pending.chunks[0]?.toString('latin1'), 'é')
  // Without an encoding, the Node default (UTF-8) applies.
  const utf8: DeferredResponse = { ...pending, chunks: [] }
  bufferChunk(utf8, 'é')
  assert.equal(utf8.chunks[0]?.length, 2)
})

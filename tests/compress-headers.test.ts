import assert from 'node:assert/strict'
import test from 'node:test'

import { headerValue, isDeferrable, varyWithAcceptEncoding } from '../src/compress.ts'

type Headers = Record<string, string | number | string[]>

test('header lookup ignores the caller key casing', () => {
  // The patch sees the RAW writeHead argument, before Node lowercases, and
  // HTTP header names are case-insensitive.
  assert.equal(headerValue({ 'Content-Type': 'application/json' }, 'content-type'), 'application/json')
  assert.equal(headerValue({ 'content-encoding': 'gzip' }, 'Content-Encoding'), 'gzip')
  assert.equal(headerValue({ Vary: 'Origin' }, 'vary'), 'Origin')
  assert.equal(headerValue({ 'X-Other': '1' }, 'content-type'), undefined)
  assert.equal(headerValue({ 'Content-Length': 42 }, 'content-length'), '42')
})

test('a mixed-case JSON content type is deferrable, a mixed-case encoding is not', () => {
  assert.equal(isDeferrable({ 'Content-Type': 'application/json' }), true)
  assert.equal(isDeferrable({ 'Content-Type': 'text/html' }), false)
  // Already encoded: compressing again would double-encode the body.
  assert.equal(isDeferrable({ 'Content-Type': 'application/json', 'Content-Encoding': 'br' }), false)
})

test('Vary is updated in place instead of duplicated under another casing', () => {
  const headers: Headers = { Vary: 'Origin' }
  varyWithAcceptEncoding(headers)
  assert.deepEqual(Object.keys(headers), ['Vary'])
  assert.equal(headerValue(headers, 'vary'), 'Origin, Accept-Encoding')
})

test('Vary is added when the caller sent none', () => {
  const headers: Headers = {}
  varyWithAcceptEncoding(headers)
  assert.equal(headers['vary'], 'Accept-Encoding')
})

test('a mixed-case content-length is removed, not left stale', () => {
  const headers: Headers = { 'Content-Length': '10', 'Content-Type': 'application/json' }
  // Mirrors the rewrite in installResponseCompression: every casing of
  // content-length must go, or the compressed body ships with the old length.
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === 'content-length') delete headers[key]
  }
  assert.equal(headerValue(headers, 'content-length'), undefined)
  assert.equal(Object.keys(headers).length, 1)
})

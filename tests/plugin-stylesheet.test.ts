import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  PLUGIN_ID,
  mountPluginStylesheet,
  pluginStyleSelector,
  type PluginStyleTag,
  type StylesheetHost,
} from '../src/client/effects/plugin-stylesheet.ts'

class FakeTag implements PluginStyleTag {
  readonly dataset: Record<string, string> = {}
  textContent = ''
  isConnected = true
  removals = 0

  remove(): void {
    this.removals += 1
    this.isConnected = false
  }
}

class FakeHead {
  readonly appended: PluginStyleTag[] = []
  readonly selectors: string[] = []
  stale: Array<{ remove(): void }> = []

  querySelectorAll(selector: string): ArrayLike<{ remove(): void }> {
    this.selectors.push(selector)
    return this.stale
  }

  appendChild(node: PluginStyleTag): void {
    this.appended.push(node)
  }
}

class FakeHost implements StylesheetHost {
  readonly head = new FakeHead()
  created = 0

  createElement(): PluginStyleTag {
    this.created += 1
    return new FakeTag()
  }
}

test('a previous copy of the plugin stylesheet is removed before mounting', () => {
  // The failure this guards: a second apply stacks a second tag, and the stale
  // copy then wins on source order inside the cascade ("the CSS change did
  // nothing" while the served bundle is correct).
  const host = new FakeHost()
  let removals = 0
  host.head.stale = [{ remove: () => { removals += 1 } }]
  mountPluginStylesheet('a{}', host, () => {})
  assert.deepEqual(host.head.selectors, [pluginStyleSelector()])
  assert.equal(removals, 1)
})

test('the mounted tag carries the plugin markers and the stylesheet text', () => {
  const host = new FakeHost()
  mountPluginStylesheet('body{}', host, () => {})
  const tag = host.head.appended[0]
  assert.notEqual(tag, undefined)
  assert.equal(tag?.dataset.plugin, PLUGIN_ID)
  assert.equal(tag?.dataset.pluginCss, `${PLUGIN_ID}/mobile.css`)
  assert.equal(tag?.textContent, 'body{}')
})

test('the deferred re-append keeps the tag last but never resurrects it', () => {
  const host = new FakeHost()
  const deferred: Array<() => void> = []
  const dispose = mountPluginStylesheet('a{}', host, (run) => { deferred.push(run) })
  assert.equal(host.head.appended.length, 1)
  deferred.forEach((run) => run())
  assert.equal(host.head.appended.length, 2, 'still connected: re-append moves it last')

  // Disposed before the deferred task ran: the tag must stay gone.
  const tag = host.head.appended[0]
  dispose()
  assert.equal(tag?.isConnected, false)
  deferred.forEach((run) => run())
  assert.equal(host.head.appended.length, 2)
})

test('the client entry point mounts through the shared helper, not inline', () => {
  const entry = readFileSync(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
  assert.match(entry, /mountPluginStylesheet\(MOBILE_CSS\)/)
  assert.doesNotMatch(entry, /document\.createElement\('style'\)/)
})

/** Plugin identity: also the `data-plugin` marker of the stylesheet the plugin owns. */
export const PLUGIN_ID = '@ddtcorex/dsh-maestro-mobile'

/** The stylesheet element this module owns, as much of it as the mount needs. */
export interface PluginStyleTag {
  readonly dataset: Record<string, string>
  textContent: string
  readonly isConnected: boolean
  remove(): void
}

/** The document surface the mount needs, injectable so the rule is unit-testable. */
export interface StylesheetHost {
  readonly head: {
    querySelectorAll(selector: string): ArrayLike<{ remove(): void }>
    appendChild(node: PluginStyleTag): void
  }
  createElement(tagName: 'style'): PluginStyleTag
}

/**
 * Selector for the plugin's own stylesheet tag(s).
 * @param pluginId - the `data-plugin` value to match.
 * @returns a selector matching exactly this plugin's tags.
 */
export function pluginStyleSelector(pluginId: string = PLUGIN_ID): string {
  return `style[data-plugin="${pluginId}"]`
}

/**
 * Mount the plugin stylesheet, replacing any copy left by a previous apply.
 *
 * A plugin re-applied in the same JS environment (client hot reload, or a second
 * apply whose dispose never ran) would otherwise stack a second stylesheet in
 * `<head>`. Two copies of the same rules do not behave like one: the older tag
 * can win on source order inside the cascade, so the symptom is "I changed the
 * CSS and nothing moved" while the served bundle is correct.
 *
 * The tag is re-appended on the next task so it stays last in `<head>`, which is
 * where its `!important` overrides of host rules need to sit; the re-append is
 * skipped once the tag is gone, so the deferred call can never resurrect it.
 * @param css - the full stylesheet text.
 * @param host - the document surface (defaults to the real document).
 * @param schedule - deferrer for the re-append (defaults to a macrotask).
 * @returns a disposer that removes the tag.
 */
export function mountPluginStylesheet(
  css: string,
  host: StylesheetHost = document as unknown as StylesheetHost,
  schedule: (run: () => void) => void = (run) => {
    setTimeout(run, 0)
  },
): () => void {
  for (const stale of Array.from(host.head.querySelectorAll(pluginStyleSelector()))) stale.remove()

  const tag = host.createElement('style')
  tag.dataset.plugin = PLUGIN_ID
  tag.dataset.pluginCss = `${PLUGIN_ID}/mobile.css`
  tag.textContent = css
  host.head.appendChild(tag)

  schedule(() => {
    if (tag.isConnected) host.head.appendChild(tag)
  })

  return () => {
    tag.remove()
  }
}

import type { ReactElement } from 'react'

/**
 * Host icon resolution, kept DOM-free and import-free so it is unit-testable
 * without a DSH runtime (this file must stay free of value imports: node:test
 * loads it directly).
 *
 * `@deepseek-ai/dsh-client-ui-primitives` has renamed its icon exports between
 * host generations: the 0.1.0-rc line exported `IconXxxOutline16` (size in the
 * name), and 0.1.7 exports weight-named pairs `IconXxxOutlineRegular` (1px) and
 * `IconXxxOutlineMedium` (1.3px). The two generations have NO names in common,
 * so a static named import silently resolves to `undefined` on the other one and
 * React throws "Element type is invalid" while rendering the whole plugin.
 *
 * So the icons are resolved by name at runtime: the first candidate that this
 * host build actually exports wins, and a name nothing matches renders nothing
 * rather than blowing up the tree.
 */

/** The shape every host icon component shares (props are size / className). */
export type HostIcon = (props: { size?: number; className?: string }) => ReactElement | null

/** Rendered when no candidate name exists in this host build: an empty icon. */
export const MISSING_ICON: HostIcon = () => null

/**
 * Pick the first candidate name the host module actually exports.
 * @param names - candidate export names, most preferred first.
 * @param table - the host icon module (a namespace object), injected for tests.
 * @returns the icon component, or MISSING_ICON when nothing matches.
 */
export function pickIcon(names: readonly string[], table: Record<string, unknown>): HostIcon {
  for (const name of names) {
    const found = table[name]
    if (typeof found === 'function') return found as HostIcon
  }
  return MISSING_ICON
}

/**
 * Drawer toggle glyph. Medium (1.3px) first, because that is what this plugin
 * has always rendered on the 0.1.7 generation; the lighter and the rc-era names
 * are the fallbacks.
 */
export const PANEL_LEFT_ICON_NAMES = [
  'IconPanelLeftOutlineMedium',
  'IconPanelLeftOutlineRegular',
  'IconPanelLeftOutline16',
] as const

/** Session-log download glyph (drawer footer), same candidate order. */
export const DOWNLOAD_ICON_NAMES = [
  'IconDownloadOutlineMedium',
  'IconDownloadOutlineRegular',
  'IconDownloadOutline16',
] as const

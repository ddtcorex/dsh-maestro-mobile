import type { ReactElement } from 'react'

/**
 * Host icon resolution, kept DOM-free and import-free so it is unit-testable
 * without a DSH runtime (this file must stay free of value imports: node:test
 * loads it directly).
 *
 * `@deepseek-ai/dsh-client-ui-primitives` exports weight-named pairs
 * (`IconXxxOutlineRegular`, `IconXxxOutlineMedium`). The icons are resolved by
 * name at runtime instead of imported statically: a name the host build does
 * not export renders nothing rather than making React throw "Element type is
 * invalid" for the whole plugin tree, and the emitted `.d.ts` stays independent
 * of whether the primitives type surface resolves in the build environment.
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

/** Drawer toggle glyph, at the emphasized (1.3px) weight. */
export const PANEL_LEFT_ICON_NAMES = ['IconPanelLeftOutlineMedium'] as const

/** Session-log download glyph (drawer footer), same weight. */
export const DOWNLOAD_ICON_NAMES = ['IconDownloadOutlineMedium'] as const

import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
import {
  DOWNLOAD_ICON_NAMES,
  PANEL_LEFT_ICON_NAMES,
  pickIcon,
  type HostIcon,
} from './icon-pick.ts'

/**
 * The plugin's two host icons, resolved at runtime instead of imported by name.
 *
 * See core/icon-pick.ts for why the lookup is by name at runtime.
 *
 * The icon TYPE is deliberately local (`HostIcon`), never imported from the
 * host: whether the primitives type surface resolves depends on the
 * environment, which made the emitted `.d.ts` unstable.
 */
const hostIcons = primitives as unknown as Record<string, unknown>

/** Drawer toggle glyph (conversation header action). */
export const IconPanelLeft: HostIcon = pickIcon(PANEL_LEFT_ICON_NAMES, hostIcons)

/** Session-log download glyph (drawer footer). */
export const IconDownload: HostIcon = pickIcon(DOWNLOAD_ICON_NAMES, hostIcons)

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
 * The host's icon export names are generation-specific (rc: `…Outline16`,
 * 0.1.7: `…OutlineRegular` / `…OutlineMedium`) and the generations share no
 * names, so a static import breaks the other one with "Element type is invalid"
 * at render time. See core/icon-pick.ts for the candidate lists and the rule.
 *
 * The icon TYPE is deliberately local (`HostIcon`), never imported from the
 * host: the primitives type surface differs per generation and whether it
 * resolves depends on the environment, which made the emitted `.d.ts` unstable.
 */
const hostIcons = primitives as unknown as Record<string, unknown>

/** Drawer toggle glyph (conversation header action). */
export const IconPanelLeft: HostIcon = pickIcon(PANEL_LEFT_ICON_NAMES, hostIcons)

/** Session-log download glyph (drawer footer). */
export const IconDownload: HostIcon = pickIcon(DOWNLOAD_ICON_NAMES, hostIcons)

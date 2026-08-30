import { BASE_CSS } from './base.css.ts'
import { LAYOUT_CSS } from './layout.css.ts'
import { MISC_CSS } from './misc.css.ts'
import { SHEET_CSS } from './sheet.css.ts'
import { EXPLORER_SHEET_CSS } from './explorer-sheet.css.ts'
import { COMPOSER_CSS } from './composer.css.ts'
import { SETTINGS_SHEET_CSS } from './settings-sheet.css.ts'
import { TOKENS_CSS } from './tokens.css.ts'

/**
 * All mobile styles, concatenated in DSH-native order:
 * tokens → base → layout → sheet → explorer-sheet → composer → settings-sheet → misc
 * Legacy compat.css.ts deleted — essential aionui visibility migrated to explorer-sheet.css.ts,
 * remaining compat polish (market/better-sidebar/taskboard) removed for core DSH mobile support.
 * Overlay fix: drawer z150 above shell.overlay so session rows remain tappable.
 */
export const MOBILE_CSS = [TOKENS_CSS, BASE_CSS, LAYOUT_CSS, SHEET_CSS, EXPLORER_SHEET_CSS, COMPOSER_CSS, SETTINGS_SHEET_CSS, MISC_CSS].join('\n')

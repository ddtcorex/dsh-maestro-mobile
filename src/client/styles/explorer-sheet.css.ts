// explorer-sheet — DSH-native bottom sheets for aionui explorer/preview
// Reuses BottomSheet tokens: --dsw-alias-bg-layer-2, --dsw-shadow-lv3, --ds-ease-out
// See design-system/pages/sheet.md
// Consolidated from legacy compat.css.ts — core visibility + geometry retained, polish migrated to DSH tokens

export const EXPLORER_SHEET_CSS = `
@media (max-width: 1023px) {
  /* Core: both cols leave grid as floating panels */
  [data-aionui-explorer-col],
  [data-aionui-preview-col] {
    position: fixed !important;
    z-index: 55 !important;
    background: var(--dsw-alias-bg-layer-2, var(--aion-bg-base, #fff)) !important;
    border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.12)) !important;
    border-left: none !important;
    box-shadow: var(--dsw-shadow-lv3, 0 -4px 28px rgba(0,0,0,.18)) !important;
    animation: dsh-maestro-mobile-sheet-in .22s var(--ds-ease-out, ease-in-out) !important;
  }
  [data-aionui-explorer-col] {
    visibility: hidden !important;
    left: 8px !important; right: 8px !important; top: auto !important; bottom: 36px !important;
    width: auto !important; height: min(55dvh, 460px) !important; max-height: calc(100dvh - 44px) !important;
    border-radius: 14px !important; overflow: hidden !important;
  }
  [data-aionui-preview-col] {
    visibility: hidden !important;
    left: 8px !important; right: 8px !important; top: auto !important; bottom: 40px !important;
    width: auto !important; height: min(50dvh, 420px) !important; max-height: calc(100dvh - 48px) !important;
    border-radius: 14px !important; overflow: hidden !important; z-index: 56 !important;
    transition: left .24s var(--ds-ease-out, ease-in-out), right .24s var(--ds-ease-out, ease-in-out), top .24s var(--ds-ease-out, ease-in-out), bottom .24s var(--ds-ease-out, ease-in-out), width .24s var(--ds-ease-out, ease-in-out), height .24s var(--ds-ease-out, ease-in-out), border-radius .24s var(--ds-ease-out, ease-in-out), box-shadow .24s var(--ds-ease-out, ease-in-out), padding-top .24s var(--ds-ease-out, ease-in-out) !important;
  }
  [data-mobile-nav="frame"][data-aionui-preview-open] [data-aionui-preview-col] { visibility: visible !important; }
  [data-mobile-nav="frame"][data-aionui-explorer-open] [data-aionui-explorer-col] { visibility: visible !important; }
  [data-mobile-nav="frame"][data-aionui-preview-open] [data-aionui-explorer-col] { visibility: hidden !important; }
  [data-mobile-nav="frame"]:not([data-sidebar-collapsed]) [data-aionui-explorer-col],
  [data-mobile-nav="frame"]:not([data-sidebar-collapsed]) [data-aionui-preview-col] { visibility: hidden !important; display: none !important; }
  .aionui-explorer-handle, .aionui-preview-handle { display: none !important; }
  .aionui-floating-expand { display: none !important; }
  /* Explorer search/header compact — reuse DSH Button/Input sizing */
  [data-aionui-explorer-col] [class*="_searchBox"] {
    border-radius: 12px !important;
    border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.12)) !important;
    background: var(--dsw-alias-bg-base, #fff) !important;
  }
  /* Preview tabs — keep DSH tab tokens, ensure ellipsis */
  [data-aionui-preview-col] [class*="_tabScroll"] {
    scrollbar-width: thin !important;
    scrollbar-color: var(--dsw-alias-label-tertiary, rgba(0,0,0,.3)) transparent !important;
  }
}
@media (prefers-reduced-motion: reduce) {
  [data-aionui-explorer-col],
  [data-aionui-preview-col] {
    animation: none !important;
  }
}
`

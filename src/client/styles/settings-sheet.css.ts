// settings-sheet — DSH-native Settings modal → bottom sheet on mobile
// Reuses DSH SettingsRoot tokens: --dsw-alias-bg-layer-2, --dsw-alias-bg-mask-1, --dsw-mask-blur,
// --dsw-shadow-lv3, --dsw-alias-border-l1/l2/inverted, --dsw-alias-label-primary, --ds-ease-out
// See design-system/pages/settings.md
// Scope is SettingsRoot only: panel:has(navList) isolates Settings from other dialogs.
// Guard: [class*="_nav"] is prefix of _navTitle/_navList/_navCell/... — outer nav uses :not guards.

export const SETTINGS_SHEET_CSS = `
@media (max-width: 1023px) {
  /* Overlay anchor: only when it hosts the Settings panel (panel:has(navList)) */
  [class*="_overlay"]:has([class*="_panel"]:has([class*="_navList"])) {
    align-items: flex-end !important;
    justify-content: center !important;
    padding: 0 !important;
  }
  [class*="_overlay"]:has([class*="_panel"]:has([class*="_navList"])) [class*="_mask"] {
    background: var(--dsw-alias-bg-mask-1, rgba(0,0,0,.24)) !important;
    backdrop-filter: var(--dsw-mask-blur, blur(2px)) !important;
    animation: dsh-maestro-mobile-fade .18s var(--ds-ease-out, ease-in-out) !important;
  }

  /* Panel: sheet — r24 top only, layer-2, lv3, handle 36x4, safe-area */
  [class*="_panel"]:has([class*="_navList"]) {
    position: relative !important;
    width: 100% !important;
    max-width: 100% !important;
    height: auto !important;
    max-height: min(92dvh, 720px) !important;
    min-height: min(52dvh, 420px) !important;
    flex-direction: column !important;
    border-radius: 24px 24px 0 0 !important;
    background: var(--dsw-alias-bg-layer-2, #fff) !important;
    border: 1px solid var(--dsw-alias-border-inverted, rgba(0,0,0,.08)) !important;
    border-bottom: none !important;
    box-shadow: var(--dsw-shadow-lv3, 0 8px 32px rgba(0,0,0,.18)) !important;
    padding-top: 10px !important;
    animation: dsh-maestro-mobile-sheet-in .22s var(--ds-ease-out, ease-in-out) !important;
    --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2) !important;
    --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2) !important;
  }
  /* Drag handle — matches BottomSheet 36x4 centered */
  [class*="_panel"]:has([class*="_navList"])::before {
    content: '' !important;
    align-self: center !important;
    width: 36px !important;
    height: 4px !important;
    margin: 2px 0 10px !important;
    border-radius: 999px !important;
    background: var(--dsw-alias-border-l2, rgba(0,0,0,.22)) !important;
    flex: none !important;
    display: block !important;
  }

  /* Nav: vertical rail → horizontal pill tabs — guard prefix overlap */
  [class*="_panel"]:has([class*="_navList"]) [class*="_nav"]:not([class*="_navTitle"]):not([class*="_navList"]):not([class*="_navCell"]):not([class*="_navLabel"]):not([class*="_navIcon"]) {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    flex: none !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 8px !important;
    padding: 0 16px 0 16px !important;
    box-sizing: border-box !important;
    overflow: hidden !important;
  }
  [class*="_panel"]:has([class*="_navList"]) [class*="_navTitle"] {
    padding: 0 44px 2px 4px !important;
    font-size: 16px !important;
    line-height: 24px !important;
    font-weight: 500 !important;
    box-sizing: border-box !important;
    max-width: 100% !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }
  [class*="_panel"]:has([class*="_navList"]) [class*="_navList"] {
    display: flex !important;
    flex-direction: row !important;
    flex-wrap: nowrap !important;
    gap: 6px !important;
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    box-sizing: border-box !important;
    overflow-x: auto !important;
    overflow-y: hidden !important;
    scrollbar-width: none !important;
    -webkit-overflow-scrolling: touch !important;
    overscroll-behavior-x: contain !important;
    touch-action: pan-x !important;
    padding-bottom: 8px !important;
    margin-bottom: 0 !important;
    border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.08)) !important;
  }
  [class*="_panel"]:has([class*="_navList"]) [class*="_navList"]::-webkit-scrollbar {
    display: none !important;
    width: 0 !important;
    height: 0 !important;
  }
  [class*="_panel"]:has([class*="_navList"]) [class*="_navCell"] {
    flex: none !important;
    height: 36px !important;
    min-width: fit-content !important;
    padding: 0 14px !important;
    border-radius: 999px !important;
    border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.12)) !important;
    background: transparent !important;
    font-size: 13px !important;
    line-height: 20px !important;
    gap: 6px !important;
    cursor: pointer !important;
    -webkit-tap-highlight-color: transparent !important;
    white-space: nowrap !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
  }
  [class*="_panel"]:has([class*="_navList"]) [class*="_navCell"]:hover {
    background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.06)) !important;
  }
  [class*="_panel"]:has([class*="_navList"]) [class*="_navCell"].active,
  [class*="_panel"]:has([class*="_navList"]) [class*="_navCell"][class*="active"] {
    background: var(--dsw-specific-sidebar-nav-item-active, #EBEEF2) !important;
    border-color: var(--dsw-specific-sidebar-nav-item-active, #EBEEF2) !important;
    color: var(--dsw-alias-label-primary, #111) !important;
  }
  [class*="_panel"]:has([class*="_navList"]) [class*="_navCell"]:focus-visible {
    outline: 2px solid var(--dsw-alias-state-business-primary, #4f6ef7) !important;
    outline-offset: 1px !important;
  }

  /* Content column: header + scrollable options */
  [class*="_panel"]:has([class*="_navList"]) [class*="_content"] {
    flex: 1 !important;
    min-height: 0 !important;
    min-width: 0 !important;
    display: flex !important;
    flex-direction: column !important;
  }
  /* Header holds "Open configuration file" action; keep it compact tight under tabs — not a 44px bar */
  [class*="_panel"]:has([class*="_navList"]) [class*="_header"] {
    flex: none !important;
    height: auto !important;
    min-height: 0 !important;
    width: 100% !important;
    padding: 6px 16px 8px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: flex-end !important;
    gap: 8px !important;
    border: none !important;
    border-bottom: none !important;
    box-sizing: border-box !important;
  }
  [class*="_panel"]:has([class*="_navList"]) [class*="_header"]:empty {
    display: none !important;
    padding: 0 !important;
    min-height: 0 !important;
  }
  [class*="_panel"]:has([class*="_navList"]) [class*="_header"] [class*="_actions"] {
    margin-left: 0 !important;
    display: flex !important;
    align-items: center !important;
    gap: 8px !important;
    min-width: 0 !important;
    margin-right: auto !important;
  }
  /* Collapse the empty 44px gap entirely when header has no visible actions (only the now-absolute close) */
  [class*="_panel"]:has([class*="_navList"]) [class*="_header"]:has(> [class*="_actions"]:empty) {
    display: none !important;
    padding: 0 !important;
    min-height: 0 !important;
  }
  [class*="_panel"]:has([class*="_navList"]) [class*="_close"] {
    position: absolute !important;
    top: 12px !important;
    right: 12px !important;
    z-index: 2 !important;
    width: 36px !important;
    height: 36px !important;
    border-radius: 999px !important;
    flex: none !important;
    cursor: pointer !important;
    -webkit-tap-highlight-color: transparent !important;
  }
  [class*="_panel"]:has([class*="_navList"]) [class*="_close"]:hover {
    background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.06)) !important;
  }
  [class*="_panel"]:has([class*="_navList"]) [class*="_close"]:focus-visible {
    outline: 2px solid var(--dsw-alias-state-business-primary, #4f6ef7) !important;
    outline-offset: 1px !important;
  }
  [class*="_panel"]:has([class*="_navList"]) [class*="_options"] {
    flex: 1 !important;
    min-height: 0 !important;
    overflow-y: auto !important;
    -webkit-overflow-scrolling: touch !important;
    padding: 16px 16px calc(16px + env(safe-area-inset-bottom, 0px)) !important;
  }
  /* Bento: sections fill sheet on mobile */
  [class*="_panel"]:has([class*="_navList"]) [class*="_section"] {
    width: 100% !important;
    max-width: none !important;
  }
}

/* Tablet 768-1023: centered constrained sheet, r24 all corners */
@media (min-width: 768px) and (max-width: 1023px) {
  [class*="_overlay"]:has([class*="_panel"]:has([class*="_navList"])) {
    align-items: center !important;
    padding: 24px 16px calc(16px + env(safe-area-inset-bottom, 0px)) !important;
  }
  [class*="_panel"]:has([class*="_navList"]) {
    width: min(calc(100vw - 32px), 720px) !important;
    max-width: min(calc(100vw - 32px), 720px) !important;
    max-height: min(82dvh, 640px) !important;
    border-radius: 24px !important;
    border: 1px solid var(--dsw-alias-border-inverted, rgba(0,0,0,.08)) !important;
    margin: 0 auto !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  [class*="_overlay"]:has([class*="_panel"]:has([class*="_navList"])) [class*="_mask"],
  [class*="_panel"]:has([class*="_navList"]) {
    animation: none !important;
  }
}

@media (min-width: 1024px) {
  [class*="_panel"]:has([class*="_navList"])::before {
    display: none !important;
  }
}
`

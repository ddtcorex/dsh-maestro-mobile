// settings-sheet — DSH-native Settings modal → bottom sheet on mobile
// Reuses DSH SettingsRoot tokens: --dsw-alias-bg-layer-2, --dsw-alias-bg-mask-1, --dsw-mask-blur,
// --dsw-shadow-lv3, --dsw-alias-border-l1/l2/inverted, --dsw-alias-label-primary, --ds-ease-out
// See design-system/pages/settings.md
// Scope is SettingsRoot only: overlay:has(navList) isolates Settings from other dialogs.
// The overlay guard is deliberately SINGLE-LEVEL: an `:has()` whose argument list
// contains another `:has()` is an invalid selector, and Chrome drops the whole rule
// when it is (no error, no warning — the declarations simply never apply). This file
// carried that nested shape from 2026-08-30, so the overlay rules below were dead and
// the Settings sheet rendered as a floating centred card instead of a bottom sheet
// until 2026-09-25. tests/css-selector-validity.test.ts now fails the build on the
// nested shape; scripts/probes/settings-sheet-probe.mjs asserts the CSSOM and the
// bottom-anchored geometry in a real browser.
// Guard: [class*="_nav"] is prefix of _navTitle/_navList/_navCell/... — outer nav uses :not guards.

export const SETTINGS_SHEET_CSS = `
@media (max-width: 1023px) and (pointer: coarse) {
  /* Overlay anchor: only when it hosts the Settings nav (single-level :has — see
     the header note on why the nested form was dropped by Chrome). */
  [class*="_overlay"]:has([class*="_navList"]) {
    align-items: flex-end !important;
    justify-content: center !important;
    padding: 0 !important;
  }
  [class*="_overlay"]:has([class*="_navList"]) [class*="_mask"] {
    background: var(--dsw-alias-bg-mask-1, rgba(0,0,0,.24)) !important;
    backdrop-filter: var(--dsw-mask-blur, blur(2px)) !important;
    animation: dsh-maestro-mobile-fade .18s var(--ds-ease-out, ease-in-out) !important;
  }

  /* Panel: sheet — r24 top only, layer-2, lv3, handle 36x4, safe-area */
  [class*="_panel"]:has([class*="_navList"]) {
    position: relative !important;
    width: 100% !important;
    max-width: 100% !important;
    height: min(92dvh, 720px) !important;
    max-height: min(92dvh, 720px) !important;
    min-height: min(92dvh, 720px) !important;
    flex-direction: column !important;
    border-radius: 24px 24px 0 0 !important;
    background: var(--dsw-alias-bg-layer-2, #fff) !important;
    border: 1px solid var(--dsw-alias-border-inverted, rgba(0,0,0,.08)) !important;
    border-bottom: none !important;
    box-shadow: var(--dsw-shadow-lv3, 0 8px 32px rgba(0,0,0,.18)) !important;
    /* The height caps above are content-box by default: measured 731px for a
       720px cap (720 + 10 padding-top + 1 border). */
    box-sizing: border-box !important;
    padding-top: 10px !important;
    animation: dsh-maestro-mobile-sheet-in .22s var(--ds-ease-out, ease-in-out) !important;
    --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2) !important;
    --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2) !important;
  }
  /* Drag handle — 36x4, centered (same grabber the retired BottomSheet used) */
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
    gap: 6px !important;
    padding: 0 16px 0 16px !important;
    box-sizing: border-box !important;
    overflow: hidden !important;
  }
  /* One 16px content inset for the whole sheet: the title used 4px and the tab
     list inherited another 16 on top of the plugin's own wrapper, so at 390px
     the title read at x=5, the first pill at x=33 and the content column at
     x=17. 44px on the right keeps the close button's disc clear. */
  [class*="_panel"]:has([class*="_navList"]) [class*="_navTitle"] {
    padding: 0 44px 2px 16px !important;
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
    /* No horizontal padding of its own: the scroll area already insets the
       column by 16px and the wrapper repeats it, which is how the pills ended
       up at x=33 while everything else sat at x=17. */
    padding: 12px 0 6px !important;
    margin-bottom: 0 !important;
    border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.08)) !important;
  }
  /* Edge affordance: the strip is 1186px wide in a 356px viewport on this
     deployment (nine tabs, three visible) and its scrollbar is hidden, so
     nothing said the tabs continue. The effect marks which ends are cut and
     only those get a fade; a constant gradient would clip the last pill even
     with nothing behind it. */
  [class*="_panel"]:has([class*="_navList"]) [class*="_navList"][data-mobile-nav-tabs="end"] {
    -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent) !important;
    mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent) !important;
  }
  [class*="_panel"]:has([class*="_navList"]) [class*="_navList"][data-mobile-nav-tabs="start"] {
    -webkit-mask-image: linear-gradient(to left, #000 calc(100% - 28px), transparent) !important;
    mask-image: linear-gradient(to left, #000 calc(100% - 28px), transparent) !important;
  }
  [class*="_panel"]:has([class*="_navList"]) [class*="_navList"][data-mobile-nav-tabs="both"] {
    -webkit-mask-image: linear-gradient(to right, transparent, #000 24px, #000 calc(100% - 28px), transparent) !important;
    mask-image: linear-gradient(to right, transparent, #000 24px, #000 calc(100% - 28px), transparent) !important;
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
    /* The header sits inside the nav title, which already carries the sheet's
       16px inset; repeating it here put the action at x=33 against a 17px
       content column. */
    padding: 4px 0 !important;
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
  /* 36px face, 44px tap area: the touch target grows 4px on each side without
     moving the glyph or eating into the title's reserved 44px. */
  [class*="_panel"]:has([class*="_navList"]) [class*="_close"]::after {
    content: '' !important;
    position: absolute !important;
    inset: -4px !important;
    border-radius: 999px !important;
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
    /* A row wider than the column made the whole area scroll sideways:
       measured 390px, the "Session plugins" row end reached x=494 in a column
       ending at x=389 (scrollWidth 493 vs clientWidth 383). The rows below
       shrink instead. */
    overflow-x: hidden !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
    -webkit-overflow-scrolling: touch !important;
    padding: 8px 16px calc(12px + env(safe-area-inset-bottom, 0px)) !important;
  }
  /* Row-end controls (the switcher chip) shrink and ellipsize inside the
     column instead of pushing the row past it. */
  /* The clamp has to reach every box between the scroll column and the chip:
     a child's max-width:100% resolves against its PARENT's width, so clamping
     only the row left it 469px wide inside a 383px column and the chip still
     ended at x=494. */
  [class*="_panel"]:has([class*="_navList"]) [class*="_options"] [class*="section"],
  [class*="_panel"]:has([class*="_navList"]) [class*="_options"] [class*="catalog"],
  [class*="_panel"]:has([class*="_navList"]) [class*="_options"] [class*="group"],
  [class*="_panel"]:has([class*="_navList"]) [class*="_options"] [class*="groupTitleRow"],
  [class*="_panel"]:has([class*="_navList"]) [class*="_options"] [class*="headerEnd"] {
    min-width: 0 !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
  }
  [class*="_panel"]:has([class*="_navList"]) [class*="_options"] [class*="groupTitleRow"] {
    width: 100% !important;
  }
  [class*="_panel"]:has([class*="_navList"]) [class*="_options"] [class*="headerEnd"] {
    flex: 0 1 auto !important;
    overflow: hidden !important;
  }
  [class*="_panel"]:has([class*="_navList"]) [class*="_options"] [class*="switcher"] {
    min-width: 0 !important;
    max-width: 100% !important;
  }
  [class*="_panel"]:has([class*="_navList"]) [class*="_options"] [class*="switcherLabel"] {
    min-width: 0 !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }
  /* Bento: sections fill sheet on mobile */
  [class*="_panel"]:has([class*="_navList"]) [class*="_section"] {
    width: 100% !important;
    max-width: none !important;
  }
}

/* Tablet 768-1023: centered constrained sheet, r24 all corners */
@media (min-width: 768px) and (max-width: 1023px) and (pointer: coarse) {
  [class*="_overlay"]:has([class*="_navList"]) {
    align-items: center !important;
    padding: 24px 16px calc(16px + env(safe-area-inset-bottom, 0px)) !important;
  }
  [class*="_panel"]:has([class*="_navList"]) {
    width: min(calc(100vw - 32px), 720px) !important;
    max-width: min(calc(100vw - 32px), 720px) !important;
    height: min(82dvh, 640px) !important;
    max-height: min(82dvh, 640px) !important;
    min-height: min(82dvh, 640px) !important;
    border-radius: 24px !important;
    border: 1px solid var(--dsw-alias-border-inverted, rgba(0,0,0,.08)) !important;
    margin: 0 auto !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  [class*="_overlay"]:has([class*="_navList"]) [class*="_mask"],
  [class*="_panel"]:has([class*="_navList"]) {
    animation: none !important;
  }
}

@media (min-width: 1024px), (pointer: fine), (pointer: none) {
  [class*="_panel"]:has([class*="_navList"])::before {
    display: none !important;
  }
}
`

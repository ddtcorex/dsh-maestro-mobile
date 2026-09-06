// composer — DSH-native composer row polish (container query)
// Reuses DSH composer card tokens: --dsw-alias-bg-layer-2, --dsw-alias-border-l1
// See design-system/pages/composer.md

export const COMPOSER_CSS = `
@media (max-width: 1023px) {
  /* Composer seat safe-area: reuse DSH composer card geometry */
  [data-phase="active"] [data-composer-seat] {
    padding-bottom: max(12px, env(safe-area-inset-bottom, 0px)) !important;
  }
  /* iOS Safari input-focus zoom guard — DSH ask_user_question inputs */
  [data-question-key] [class*="_customInput"],
  [data-question-key] [class*="_customTextarea"] {
    font-size: 16px !important;
  }
  /* Hide tooltips on touch — "Stop generating" lingers mid-screen after tap on mobile */
  [role="tooltip"] {
    display: none !important;
  }
  /* Ask question composer — fix Submit cutoff on narrow phones (user report 390px).
     The footer is a single row (pager + feedback flex:1 + actions) that overflows
     the card's 100% width on phones; feedback pushes actions off-screen. Wrap the
     footer so actions stay reachable. */
  [data-question-key] [class*="_frame"] {
    padding-left: 12px !important;
    padding-right: 12px !important;
  }
  [data-question-key] [class*="_card"] {
    max-width: 100% !important;
  }
  [data-question-key] [class*="_footer"] {
    flex-wrap: wrap !important;
    gap: 10px 12px !important;
    padding-left: 12px !important;
    padding-right: 12px !important;
  }
  [data-question-key] [class*="_feedback"] {
    flex: 1 1 100% !important;
    min-width: 0 !important;
    order: 3 !important;
    text-align: left !important;
  }
  [data-question-key] [class*="_footerActions"] {
    flex: 0 1 auto !important;
    justify-content: flex-end !important;
    width: auto !important;
    order: 2 !important;
    margin-left: auto !important;
  }
  [data-question-key] [class*="_pager"] {
    order: 1 !important;
  }
  /* Composer status bar (turns/steps/LLM/TPS) — single-line horizontal scroll on mobile */
  [data-mobile-nav="stats"] {
    display: flex !important;
    flex-wrap: nowrap !important;
    overflow-x: auto !important;
    overflow-y: hidden !important;
    -webkit-overflow-scrolling: touch !important;
    scrollbar-width: none !important;
    gap: 12px !important;
    white-space: nowrap !important;
    align-items: center !important;
    padding: 4px 12px 6px !important;
    box-sizing: border-box !important;
  }
  [data-mobile-nav="stats"]::-webkit-scrollbar {
    display: none !important;
  }
  [data-mobile-nav="stats"] > * {
    flex: 0 0 auto !important;
    white-space: nowrap !important;
  }
}
`

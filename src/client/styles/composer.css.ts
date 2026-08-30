// composer — DSH-native composer row polish (container query)
// Reuses DSH composer card tokens: --dsw-alias-bg-layer-2, --dsw-alias-border-l1
// See design-system/pages/composer.md

export const COMPOSER_CSS = `
@media (max-width: 1023px) {
  /* Composer seat safe-area: reuse DSH composer card geometry */
  [data-phase="active"] [data-composer-seat] {
    padding-bottom: max(12px, env(safe-area-inset-bottom, 0px)) !important;
  }
  /* Row container query — DSH composer row is flex with dropdowns that must not clip */
  [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) {
    container-type: inline-size;
    container-name: dsh-mobile-composer;
    gap: 6px !important;
    padding-left: 6px !important;
    padding-right: 6px !important;
    overflow: visible !important;
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
  /* Model dropdown centered, max 320px — DSH Menu tokens */
  [data-phase] [class*="_card"]:has(textarea) [class*="_root"]:has(> [class*="_trigger"]) > [class*="_menu"] {
    left: 50% !important;
    right: auto !important;
    transform: translateX(-50%) !important;
    max-width: min(320px, calc(100vw - 16px)) !important;
    background: var(--dsw-alias-bg-overlay, #fff) !important;
    border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.12)) !important;
    box-shadow: var(--dsw-shadow-lv3, 0 8px 24px rgba(0,0,0,.12)) !important;
    border-radius: 12px !important;
  }
}
`

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
  /* Long unbreakable tokens (URLs, file paths, flag names, model ids) in the
     question title, an option's copy or the markdown detail must wrap: the
     card is overflow:hidden, so a token that cannot break is painted past the
     card edge and silently clipped mid-word. anywhere (not break-word) also
     lowers the min-content size, which is what lets the option label shrink
     inside the option row's flex line. */
  [data-question-key] [class*="_title"],
  [data-question-key] [class*="_optionLine"],
  [data-question-key] [class*="_detail"] {
    overflow-wrap: anywhere !important;
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
  [data-mobile-nav="stats"] {    display: flex !important;
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
  /* One-tap attachment entry (conversation.input.left), styled to sit beside
     the permission selector as a bare 28px icon button: transparent fill, no
     border, hover-only affordance — the same ghost pattern upstream uses for
     its own icon buttons (e.g. the right-sidebar tab strip). flex:none keeps
     it out of the row's shrink cascade, which is scoped to the labelled
     triggers. */
  [data-mobile-nav="attach"] {
    display: grid !important;
    place-items: center !important;
    flex: 0 0 auto !important;
    width: 28px !important;
    height: 28px !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 999px !important;
    background: transparent !important;
    color: var(--dsw-alias-label-primary, #0f1115) !important;
    cursor: pointer !important;
    -webkit-tap-highlight-color: transparent;
  }
  [data-mobile-nav="attach"]:hover {
    background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .06)) !important;
  }
  [data-mobile-nav="attach"]:focus-visible {
    outline: 2px solid var(--dsw-alias-state-business-primary, #0a84ff) !important;
    outline-offset: 1px !important;
  }
}
`

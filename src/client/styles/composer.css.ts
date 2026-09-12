// composer — DSH-native composer row polish (container query)
// Reuses DSH composer card tokens: --dsw-alias-bg-layer-2, --dsw-alias-border-l1
// See design-system/pages/composer.md

export const COMPOSER_CSS = `
@media (max-width: 1023px) and (pointer: coarse) {
  /* Composer seat safe-area: reuse DSH composer card geometry */
  [data-phase="active"] [data-composer-seat] {
    padding-bottom: max(12px, env(safe-area-inset-bottom, 0px)) !important;
  }
  /* The iOS focus-zoom 16px field floor (including the ask composer's height
     mirror) lives in misc.css.ts, gated on html[data-mobile-nav-ios]. */
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
    /* A long question must scroll, never clip. The card caps its height at
       min(60vh, 520px) and delegates scrolling to the option list alone
       (.body), while the question itself lives in the card's fixed, unshrinkable
       header: a question that wraps past the cap spends the whole budget, .body
       computes to zero height (a zero-height scrollport cannot scroll), and the
       footer is pushed below the card's overflow:hidden edge — the choices and
       Submit become unreachable on a phone (mobile report 2026-09-11: "bị dài
       theo chiều dọc mà không scroll được"). Make the card itself the single
       scrollport so the question, the options and the footer scroll together,
       and dissolve the inner scroll seat so the two do not nest. */
    overflow-y: auto !important;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain !important;
    /* Positioning context for the header action pair, which is taken out of
       the heading block's flow below. */
    position: relative !important;
  }
  [data-question-key] [class*="_card"] > header,
  [data-question-key] [data-question-scroll] {
    flex: 0 0 auto !important;
    min-height: 0 !important;
    overflow: visible !important;
  }
  /* Long unbreakable tokens (URLs, file paths, flag names, model ids) in the
     question title, an option's copy or the markdown detail must wrap: the
     card clips horizontally, so a token that cannot break is painted past the
     card edge and silently clipped mid-word. anywhere (not break-word) also
     lowers the min-content size, which is what lets the option label shrink
     inside the option row's flex line. */
  [data-question-key] [class*="_title"],
  [data-question-key] [class*="_optionLine"],
  [data-question-key] [class*="_detail"] {
    overflow-wrap: anywhere !important;
  }
  /* The question is the card's lead line, but it must read as part of the same
     text as the answer it asks about, and it must use the whole popup width.
     Upstream keeps the heading block in a flex lane beside the 24px
     collapse/close pair, which costs the question a 52px lane plus a 16px gap
     (verified 390px: title box 218px wide against a 316px card, while the
     option copy it belongs to spans 300px) and ships the question one pixel
     larger than that copy (15px/21px against 14px/24px). Take the action pair
     out of the flow, park it in the card's top-right corner, and give the
     heading block the full width; the eyebrow keeps a right inset so it never
     runs under the buttons and its extra 3px bottom margin starts the title
     below them (buttons occupy 10..34px of the header). */
  [data-question-key] [class*="_card"] > header {
    display: block !important;
    padding-right: 12px !important;
  }
  [data-question-key] [class*="_headerActions"] {
    position: absolute !important;
    top: 10px !important;
    right: 12px !important;
  }
  [data-question-key] [class*="_eyebrow"] {
    padding-right: 56px !important;
    margin-bottom: 8px !important;
  }
  [data-question-key] [class*="_title"] {
    font-size: 14px !important;
    line-height: 24px !important;
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
}
`

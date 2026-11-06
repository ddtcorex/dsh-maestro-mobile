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
  /* Hide tooltips on touch — "Stop generating" lingers mid-screen after tap on
     mobile. Scoped to the conversation phase and gated on a touch-ish pointer:
     an unscoped [role="tooltip"] rule would also hide tooltips owned by other
     plugins (market, dashboard, third-party panels) on any phone. */
  @media (hover: none), (pointer: coarse) {
    [data-phase] [role="tooltip"] {
      display: none !important;
    }
  }
  /* --- Ask card (ask_user_question): tier-independent touch and text rules ---
     Everything below is scoped to [data-question-key], which the host puts on
     the QuestionComposer frame itself (0.2.2 bundle, measured), so a compound
     '[data-question-key][class*="_frame"]' is the frame and a descendant
     '[data-question-key] [class*="_x"]' reaches the card's parts only. */
  /* Long unbreakable tokens (URLs, file paths, flag names, model ids) in the
     question title, an option's label/copy, the markdown detail or the review
     note must wrap: the card clips horizontally, so a token that cannot break
     is painted past the card edge and silently clipped mid-word. anywhere (not
     break-word) also lowers the min-content size, which is what lets an option
     label shrink inside the option row's flex line — without min-width:0 the
     label refuses to shrink at all. Measured live 2026-11-06 over the
     0.2.2-rc.1 bundle, which renders all of these classes. */
  [data-question-key] [class*="_title"],
  [data-question-key] [class*="_optionLine"],
  [data-question-key] [class*="_optionLabel"],
  [data-question-key] [class*="_optionCopy"],
  [data-question-key] [class*="_description"],
  [data-question-key] [class*="_detail"],
  [data-question-key] [class*="_reviewNote"] {
    min-width: 0 !important;
    overflow-wrap: anywhere !important;
  }
  /* Ask body horizontal convergence (upstream v3.2.2 port): the host body
     only declares overflow-y, so the other axis computes to auto and a long
     token stretches it into a horizontal scroller. The phone tier below
     dissolves the body scroll and re-hands clipping to the card. */
  [data-question-key] [class*="_body"] {
    min-width: 0 !important;
    overflow-x: hidden !important;
  }
  /* Ask fullscreen (upstream v3.2.2 port): manual toggle only. The card takes
     the header-to-composer band the effect measures; without the marker the
     host min(60vh, 520px) cap stays. The reserve is the only measured number
     the CSS does not derive. The minimized one-line card is excluded: sizing
     it by the band would stretch the collapsed strip (mobile audit
     2026-11-06: [class*="_card"] without the guard also matched
     _cardMinimized, present in the 0.2.2 bundle). */
  [data-mobile-nav="frame"][data-mobile-nav-question-full] [data-question-key] [class*="_card"]:not([class*="_cardMinimized"]) {
    height: var(--mobile-question-band, auto) !important;
    max-height: var(--mobile-question-band, min(60vh, 520px)) !important;
  }
  /* The injected expand button receives no host class, so the browser's
     default button chrome (border, face, padding) painted around its glyph
     next to the host's bare icon buttons and read as a misplaced third
     button. Reset it to the same ink: 24px grid, no chrome, currentColor
     stroke (live report 2026-11-06: "middle button still off"). */
  [data-question-key] [data-mobile-nav="question-expand"] {
    display: grid !important;
    place-items: center !important;
    width: 24px !important;
    height: 24px !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 999px !important;
    background: none !important;
    color: inherit !important;
  }
  [data-question-key] [data-mobile-nav="question-expand"] svg {
    width: 14px !important;
    height: 14px !important;
  }
  [data-question-key] [data-mobile-nav="question-expand"] .dsh-maestro-mobile-question-collapse {
    display: none !important;
  }
  [data-mobile-nav="frame"][data-mobile-nav-question-full] [data-question-key] [data-mobile-nav="question-expand"] .dsh-maestro-mobile-question-expand {
    display: none !important;
  }
  [data-mobile-nav="frame"][data-mobile-nav-question-full] [data-question-key] [data-mobile-nav="question-expand"] .dsh-maestro-mobile-question-collapse {
    display: block !important;
  }
  /* Touch-target floor for the icon column at every width: upstream ships
     24x24 icons at a 4px gap, far under the touch floor, and "dismiss all"
     (which clears the group's drafts without a confirm) sits right beside
     "collapse". Visible ink is untouched; each transparent ::after expands the
     hit box to 32x32. The phone tier below raises both to 44px with an
     absolute column; tablets keep the host inline row at this floor. */
  [data-question-key] [class*="_headerActions"] {
    gap: 12px !important;
  }
  [data-question-key] [class*="_headerActions"] button {
    position: relative !important;
  }
  [data-question-key] [class*="_headerActions"] button::after {
    content: '' !important;
    position: absolute !important;
    inset: -4px !important;
  }
  /* --- Phone tier (portrait phones): one scrollport, pinned footer, wide
     question. 768-1023 touch keeps the host's own card layout; these are
     geometry decisions tied to a one-handed portrait column. Nested media
     like the tooltip block above. */
  @media (max-width: 767px) {
    /* The frame itself carries data-question-key on this host, so the pad
       write must be a compound selector: the descendant form matched nothing
       and the host's 16px side clearance stayed (measured: card x=32). 12px
       aligns the card with the composer card's column. */
    [data-question-key][class*="_frame"] {
      padding-left: 12px !important;
      padding-right: 12px !important;
    }
    /* The card is the single scrollport: a long question must scroll, never
       clip. The card caps its height at min(60vh, 520px) and the host
       delegates scrolling to the option list alone (.body), while the
       question lives in the card's fixed, unshrinkable header: a question
       that wraps past the cap either spends the whole budget or — the 2026-11-06
       audit — gets its own internal cap (removed with the upstream v3.2.3
       fourth round: two nested scroll areas read as one seam splitting
       mid-line). Scrolling the card lets question, options and footer move
       together. The minimized one-line card is excluded from every transform:
       [class*="_card"] also matched _cardMinimized in the 0.2.2 bundle and a
       scrollport + block layout on the collapsed strip broke it. */
    [data-question-key] [class*="_card"]:not([class*="_cardMinimized"]) {
      max-width: 100% !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior-y: contain !important;
      /* Positioning context for the absolute header action pair below. */
      position: relative !important;
    }
    /* Header and body flow inside that one scrollport; the body's own pin
       above is overridden (higher specificity) so the body is not a scroll
       container of its own — with overflow-x:hidden plus the host's
       overscroll-behavior the finger stops in the body and the card never
       receives the swipe. Horizontal clipping is on the card. */
    [data-question-key] [class*="_card"]:not([class*="_cardMinimized"]) > [class*="_body"] {
      flex: 0 0 auto !important;
      min-height: 0 !important;
      overflow: visible !important;
    }
    [data-question-key] [class*="_card"]:not([class*="_cardMinimized"]) > header {
      display: block !important;
      flex: 0 0 auto !important;
      min-height: 0 !important;
      overflow: visible !important;
      /* Breathing between the question and the option list; also keeps the
         painted question from touching the first option heading. */
      padding-bottom: 8px !important;
      padding-right: 12px !important;
    }
    /* The question is the card's lead line, but it must read as part of the
       same text as the answer it asks about. Upstream keeps the heading block
       in a flex lane beside the 24px collapse/close pair, which costs the
       question a 52px lane plus a 16px gap; the action column is therefore
       taken out of the flow and parked in the card's top-right corner. The
       type matches the host's mobile body measure (15px/23px, upstream
       owner-calibrated) instead of the smaller 14px/24px. */
    [data-question-key] [class*="_headingBlock"] {
      flex: 1 1 100% !important;
      min-width: 0 !important;
    }
    [data-question-key] [class*="_headerActions"] {
      position: absolute !important;
      top: 10px !important;
      right: 12px !important;
      gap: 20px !important;
    }
    /* 44px touch targets: visible icons stay 24px, the transparent ::after
       expands each hit box to 44x44 with 20px spacing so neighbors just touch
       without overlapping (beyond half the pitch the boxes would steal each
       other's first tap). top:10 keeps the whole 44px box inside the card's
       overflow:hidden. */
    [data-question-key] [class*="_headerActions"] button::after {
      inset: -10px !important;
    }
    /* Measured live 2026-11-06 at 390px: the column is three 24px buttons at
       a 20px gap (112px wide, leftmost hit box starting x=217) and the
       eyebrow's 56px reserve still let its text run through all three hit
       boxes — a long eyebrow was painted under the buttons and the first tap
       landed on an icon instead of the text. The reserve now clears the whole
       column including the 44px hit boxes (120px); a longer eyebrow wraps to
       a second line instead of colliding. */
    [data-question-key] [class*="_eyebrow"] {
      padding-right: 120px !important;
      margin-bottom: 8px !important;
    }
    [data-question-key] [class*="_title"] {
      font-size: 15px !important;
      line-height: 23px !important;
    }
    /* Footer pinned to the card bottom: a sticky in-scroller keeps Submit and
       Skip reachable without scrolling even when the question and the options
       have spent the card's height budget (measured 2026-11-06: the in-flow
       footer sat 23px past the card's clip edge with the feedback row hidden
       under overflow:hidden). bottom:0 pins to the scrollport edge; the
       card-inherited background plus bottom padding keeps body text scrolling
       under the buttons from showing through. */
    [data-question-key] [class*="_card"]:not([class*="_cardMinimized"]) > [class*="_footer"] {
      position: sticky !important;
      bottom: 0 !important;
      z-index: 1 !important;
      background: inherit;
      padding-top: 10px !important;
      padding-bottom: 12px !important;
      margin-top: 4px !important;
    }
    /* Footer wrap (the original Submit-cutoff fix): pager, actions and the
       one-line feedback make three lanes that overflow the card on a phone;
       the wrap keeps them stacked and reachable and the sticky above keeps
       the whole group on screen. */
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

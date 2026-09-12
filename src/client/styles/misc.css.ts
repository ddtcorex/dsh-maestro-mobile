// misc — split from src/client/mobile.css.ts (2026-08-16), order preserved.
// Self-contained: each section (composer / tablet / desktop) carries its own
// media query.

export const MISC_CSS = `@media (max-width: 1023px) and (pointer: coarse) {
  /* ---------- composer dock: swap git branch chip with the todo card ----------
     The git-graph branch chip (conversation.input.dock, order 100) floats
     alone at the bottom-left above the input card, with a dead zone to its
     right; the full-width todo card (order 0) sits above it. Swap them so
     the chip reads as the stack's top row and the todo card fills the row
     above the composer. The dock container itself is display:contents
     (inline style) — its children are direct flex items of the composer
     stack, so order on the children is what reorders them. Only the chip
     needs an order change: -1 puts it before the todo card (order 0) and
     before the input card (order 0, later in DOM). The todo card must KEEP
     its order 0 — raising it past the input card's order 0 would drop it
     below the composer entirely (2026-08-16 regression, fixed). The queue
     strip (order 20) keeps hugging the input card. Desktop untouched (this
     block lives inside the max-width: 1023px media query). */
  [data-slot="conversation.input.dock"] [data-gitgraph-chip-anchor] {
    order: -1 !important;
  }
  /* Mobile tap target + feedback for the branch chip (git-graph, 24px
     desktop spec). Two real-world problems: ① the chip is tiny and sits
     right above the expandable todo card — mis-taps land on the todo card;
     ② opening the popover waits for the host's /git/branches round-trip
     (~700ms on device) with zero feedback, so users tap again and toggle
     the popover closed. Enlarge the target, kill double-tap zoom delay,
     and give an instant pressed state so a tap reads as registered. */
  [data-slot="conversation.input.dock"] [data-gitgraph-chip-anchor] [data-gitgraph-chip] {
    touch-action: manipulation !important;
    min-height: 34px !important;
    padding: 0 12px !important;
    font-size: 13px !important;
  }
  [data-slot="conversation.input.dock"] [data-gitgraph-chip-anchor] [data-gitgraph-chip]:active {
    transform: scale(.96) !important;
    transition: transform .12s !important;
  }

  /* ---------- iOS focus-zoom floor: raise the fields, do not ban zoom ----------
      Safari on iPhone enlarges the whole visual viewport when a focused
      <input> / <textarea> computes font-size < 16px, and only reverts on blur.
      The ask dialog is a modal composer takeover, so taps outside never blur
      the field and the magnification persists until the field loses focus.
      Gated on html[data-mobile-nav-ios] (phone-chrome.ts detectIosWebKit)
      because only WebKit on iOS zooms on focus: Android and desktop keep the
      compact fields they were designed with, and no zoom-limiting token is
      written into the viewport meta (that would take pinch away from them).
      The floor covers every text-entry control on the page, including the ones
      portalled outside the frame (settings dialogs, the market sheet,
      third-party panels) — a phone can reach all of them. Button-like inputs
      are excluded (nothing to type, no keyboard) and select is left alone on
      purpose: it would break the composer's 28px access-mode control, and a
      native picker overlays the screen instead of leaving a zoomed page behind.
      The ask composer's hidden height mirror must carry the SAME size as its
      textarea — it is what sizes the auto-grown field, so a mismatch makes the
      box the wrong height for the typed text. */
  html[data-mobile-nav-ios] textarea,
  html[data-mobile-nav-ios] [contenteditable]:not([contenteditable="false"]),
  html[data-mobile-nav-ios] [data-input-mirror],
  html[data-mobile-nav-ios] [data-input-backdrop],
  html[data-mobile-nav-ios] [data-question-key] [class*="_fieldMirror"],
  html[data-mobile-nav-ios] input:not([type="button"]):not([type="checkbox"]):not([type="color"]):not([type="file"]):not([type="hidden"]):not([type="image"]):not([type="radio"]):not([type="range"]):not([type="reset"]):not([type="submit"]) {
    font-size: 16px !important;
  }

  /* ---------- new-session hero preset menu: prevent top cutoff on long lists ----------
     Host Menu (ui-primitives/Menu.tsx) measures lh from calc(100vh - 24px) but
     clamps with innerHeight (dynamic viewport) using
     Math.min(Math.max(y,12),vh-lh-12). When 100vh > innerHeight (mobile Safari
     with address bar, notch) lh exceeds vh and the clamp inverts to a negative
     top, so the first presets render above the viewport. dvh tracks the dynamic
     viewport, so the measured lh matches the clamp's vh; keep the 100vh
     fallback for engines without dvh and include safe-area insets. */
  body > div[role="menu"] {
    max-height: calc(100vh - 24px) !important;
    max-height: calc(100dvh - 24px) !important;
    max-height: calc(100dvh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) !important;
  }

  /* ---------- drawer session tree: skip off-screen rendering ----------
     content-visibility: auto lets engine skip layout/paint of off-screen rows
     when drawer closed (early-commit) and of off-screen rows in long history. */
  [data-mobile-nav="frame"] > :first-child [role="tree"] {
    content-visibility: auto;
    contain-intrinsic-size: auto 600px;
  }
}

/* ---------- session delete: confirmation dialog ----------
   Gated on the pointer, NOT on width: the delete item is injected on
   touch-primary devices at every width (a large tablet in landscape keeps the
   desktop layout but still gets it), so a width-gated stylesheet would leave
   the dialog unstyled there. The dialog only exists once this plugin injected
   the item.

   Hosted on <body> (session-menu.ts) and centred in the viewport. Measured
   live: the drawer column carries z-index 150 and the frame's own overlay
   layer 20, so a dialog appended to the AppFrame at z-index 70 painted UNDER
   the open drawer and its buttons were unreachable.

   Recipe (design-system/pages/session-delete.md): mask token + --dsw-mask-blur,
   layer-2 surface, radius 24, --dsw-shadow-lv3, --ds-ease-out, reduced-motion
   off. */
@media (pointer: coarse) {
  [data-mobile-nav="delete-dialog-backdrop"] {
    position: fixed;
    inset: 0;
    /* Above the shell's own scale: the drawer column is z-index 150 and the
       settings panel 40, so 199/200 keeps the confirmation on top of both. */
    z-index: 199;
    background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, .24));
    backdrop-filter: var(--dsw-mask-blur, blur(2px));
    -webkit-backdrop-filter: var(--dsw-mask-blur, blur(2px));
    animation: dsh-maestro-mobile-fade .18s var(--ds-ease-out, ease-in-out);
  }
  [data-mobile-nav="delete-dialog"] {
    position: fixed;
    /* Centred with inset + margin:auto (not a transform) so the entrance
       animation cannot fight the centring. */
    inset: 0;
    margin: auto;
    z-index: 200;
    width: min(calc(100vw - 32px), 380px);
    height: fit-content;
    max-height: calc(100dvh - 48px);
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 20px 18px 16px;
    box-sizing: border-box;
    border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .04));
    border-radius: 24px;
    background: var(--dsw-alias-bg-layer-2, #fff);
    color: var(--dsw-alias-label-primary, #0f1115);
    box-shadow: var(--dsw-shadow-lv3, 0 12px 32px rgba(0, 0, 0, .08));
    animation: dsh-maestro-mobile-sheet-in .22s var(--ds-ease-out, ease-in-out);
  }
  [data-mobile-nav="delete-confirm-title"] {
    font-size: 16px;
    line-height: 24px;
    font-weight: 500;
  }
  [data-mobile-nav="delete-confirm-desc"] {
    font-size: 14px;
    line-height: 22px;
    color: var(--dsw-alias-label-secondary, #61666b);
    overflow-wrap: anywhere;
  }
  [data-mobile-nav="delete-error"] {
    font-size: 13px;
    line-height: 19px;
    color: var(--dsw-alias-state-error-primary, #ec1313);
    overflow-wrap: anywhere;
  }
  [data-mobile-nav="delete-confirm-actions"] {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 2px;
  }
  [data-mobile-nav="delete-confirm-actions"] button {
    /* 44px keeps the iOS/Android touch target even at the smallest width. */
    min-height: 44px;
    padding: 0 18px;
    border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .04));
    border-radius: 12px;
    background: transparent;
    color: var(--dsw-alias-label-primary, #0f1115);
    font: inherit;
    font-size: 14px;
    line-height: 22px;
    font-weight: 500;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  [data-mobile-nav="delete-confirm-actions"] button:hover:not(:disabled),
  [data-mobile-nav="delete-confirm-actions"] button:active:not(:disabled) {
    background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .04));
  }
  [data-mobile-nav="delete-confirm-actions"] button:focus-visible {
    outline: 2px solid var(--dsw-alias-state-business-primary, #4176e6);
    outline-offset: 1px;
  }
  /* Destructive action: a danger OUTLINE, not a filled button. The fill would
     need an on-error foreground token and DSH has none, so a filled red button
     could invert its label in a light-fill theme; the token red on the layer-2
     surface clears 4.5:1 in both themes. The selector repeats the actions
     scope because the plain actions-button rule is (0,1,1) and would otherwise
     win over this (0,1,0) rule — exactly how the danger colour went missing
     before. (No backticks anywhere in this file: the stylesheet is a TS
     template literal.) */
  [data-mobile-nav="delete-confirm-actions"] [data-mobile-nav="delete-confirm-yes"] {
    border-color: var(--dsw-alias-state-error-primary, #ec1313);
    color: var(--dsw-alias-state-error-primary, #ec1313);
    background: transparent;
  }
  [data-mobile-nav="delete-confirm-actions"] button:disabled {
    opacity: .5;
    cursor: default;
  }
  @media (prefers-reduced-motion: reduce) {
    [data-mobile-nav="delete-dialog"],
    [data-mobile-nav="delete-dialog-backdrop"] {
      animation: none !important;
    }
  }
}

/* ---------- tablet / wide mobile: keep sheets from becoming full-width ----------
   Below 768px the near-full-width sheets are the right call for a phone.
   On wider but still sub-desktop viewports (foldables, tablet portrait,
   desktop-mode tall windows) the same full-bleed sheet leaves content
   clustered at the left edge with a large dead zone on the right. Cap and
   center the modal sheets and the aionui bottom sheets instead. */
@media (min-width: 768px) and (max-width: 1023px) and (pointer: coarse) {
  /* All modal dialogs: centered, never edge-to-edge. The settings sheet has
     a higher-specificity full-width rule above, so repeat its selector here
     to win; the generic export/other-modal rule is covered by the second
     selector. */
  [aria-modal="true"]:has(> :first-child > :last-child > button):not(:has([role="navigation"])):not(:has([class*="ZuhsRW"])),
  [aria-modal="true"]:not(:has(> :first-child > :last-child > button)) {
    left: 0 !important;
    right: 0 !important;
    margin-left: auto !important;
    margin-right: auto !important;
    width: min(calc(100vw - 32px), 720px) !important;
    max-width: min(calc(100vw - 32px), 720px) !important;
  }

  /* The dsh-web-ui explorer / preview bottom sheets: same treatment — keep
     the mobile bottom-sheet behavior, but stop them spanning the full width. */
  [data-aionui-explorer-col],
  [data-aionui-preview-col] {
    left: 0 !important;
    right: 0 !important;
    width: min(calc(100vw - 32px), 720px) !important;
    margin-left: auto !important;
    margin-right: auto !important;
  }

  /* Settings sections (e.g. Agent presets) often carry a desktop max-width
     (720px) that leaves a dead strip on the right once the sheet is capped to
     the same width; let them fill the sheet body instead. */
  [aria-modal="true"] [class*="_section"] {
    width: 100% !important;
    max-width: none !important;
  }
}

/* ---------- desktop: the mobile controls must never appear ---------- */

@media (min-width: 1024px), (pointer: fine), (pointer: none) {
  [data-mobile-nav="toggle"],
  [data-mobile-nav="fab"],
  [data-mobile-nav="backdrop"],
  [data-mobile-nav="session-log"],
  [data-mobile-nav="drawer-actions"] {
    display: none !important;
  }
}
`

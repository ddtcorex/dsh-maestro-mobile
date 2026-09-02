// layout — split from src/client/mobile.css.ts (2026-08-16), order preserved.
// Self-contained: the mobile media query opens and closes in this file.

export const LAYOUT_CSS = `/* ---------- mobile-only layout ---------- */

@media (max-width: 1023px) {
  /* --- Phone chrome ---
     The system status bar stays visible (no fullscreen). Three adjustments
     make it behave:
     - touch-action: pan-y keeps vertical pan while forbidding horizontal pan
       on the root — without it a left-edge horizontal drag is claimed as a
       pan (pointercancel) before the swipe layer can classify it. Also kills
       double-tap-to-zoom delay; pinch-zoom stays via manipulation alias but
       the app-like pan-y is the gesture-layer contract.
     - overscroll-behavior-x: none suppresses Chrome's edge history navigation
       (48dp strip) that would navigate back on the same edge swipe that opens
       the drawer.
     - With the client's viewport-fit=cover, env(safe-area-inset-top) is the
       status bar / notch height; the rules below push the app content below
       it so the status bar never covers anything. Off notched phones (or in
       a normal browser tab where the layout viewport already sits below the
       status bar) the inset is 0 and nothing shifts. */
  html,
  body {
    touch-action: pan-y !important;
    overscroll-behavior-x: none !important;
  }

  /* AppFrame: the drawer takes the sidebar column out of grid flow, so the
     remaining in-flow items (center, details) land in tracks 1..2: give the
     center every pixel and keep the details track at zero. The top padding
     clears the status bar / notch for every in-flow surface (session header,
     messages, composer); the absolutely-positioned drawer is unaffected (its
     containing block is the frame's padding box, i.e. still the frame top).
     box-sizing MUST be border-box: the official frame is height:100% of a
     100%-height body, and it is content-box by default, so the safe-area
     padding is ADDED on top of the full viewport height. The frame then grows
     to 100% + inset, the document itself becomes scrollable by exactly the
     inset, and the sticky composer seat (bottom:0 of the scroll body) lands
     below the visual viewport. Symptoms on a notched phone: the whole UI can
     be swiped up, the composer lifts off the bottom leaving a blank strip,
     and the newest message sits under the composer because the host's
     at-bottom follow scrolls its own scroll body, not the document. With
     border-box the padding is taken out of the 100% height instead, so the
     frame is exactly one viewport tall and the document never scrolls. */
  [data-mobile-nav="frame"] {
    box-sizing: border-box !important;
    position: relative !important;
    grid-template-columns: minmax(0, 1fr) 0 0 !important;
    padding-top: env(safe-area-inset-top, 0px) !important;
  }

  /* The sidebar column (first grid child) becomes a left drawer. The drawer
     hugs the sidebar content exactly (the wide sidebar carries an inline
     width, ~280px): a fixed 92vw box would leave a white strip where the
     container background shows beside the content.
     Closed state: translateX(-110%) — more than -100% of the max-content
     width — guarantees the whole drawer (and its shadow, had it one) leaves
     the viewport. A mere -100% leaves a sliver on screen; -105% (as used
     before) left 14px of the drawer plus a long 32px-blur shadow gradient
     visible along the left edge of the main UI. No box-shadow at all: the
     dimmed backdrop already separates drawer from content. */
  [data-mobile-nav="frame"] > :first-child {
    position: absolute !important;
    inset: 0 auto 0 0 !important;
    width: max-content;
    max-width: 92vw;
    z-index: 150 !important; /* above shell.overlay (z100) so backdrop (z30 inside) stays below drawer and session rows remain tappable */
    transform: translateX(-110%);
    transition: transform .28s var(--ds-ease-in-out, ease-in-out);
    background: var(--dsw-alias-bg-base, #ffffff);
    /* Keep the drawer's own content below the status bar / notch: the drawer
       spans the full frame height (its absolute containing block is the
       frame's padding box, so the frame's own safe-area padding does NOT
       reach it). The drawer background paints the status-bar strip, which
       the client's theme-color meta matches, so the strip reads seamless. */
    padding-top: env(safe-area-inset-top, 0px) !important;
    padding-bottom: env(safe-area-inset-bottom, 0px) !important;
    box-sizing: border-box !important;
    /* Kill the official sidebarCol right border: with the backdrop the edge
       reads cleanly, and the settings dialog (width:100% of this box) stays
       pixel-flush with the drawer. */
    border-right: none !important;
  }

  /* Expanded state (frame without data-sidebar-collapsed) slides the drawer in.
     The open state must be transform:none — NOT translateX(0): an identity
     transform still makes the drawer the containing block for fixed-position
     descendants (the settings dialog's .VOzbGW_overlay is portaled into the
     sidebar DOM). With the identity transform the wide settings sheet
     (100vw-16) overflows the 280px drawer, the dialog's focus scrolls the
     overflow:hidden drawer to scrollLeft=102, and every static child (plus the
     fixed overlay) shifts 102px off-screen. With transform:none the overlay is
     viewport-anchored: it dims the full screen and the sheet sits at left:8. */
  [data-mobile-nav="frame"]:not([data-sidebar-collapsed]) > :first-child {
    transform: none !important;
  }

  /* Drawer swipe gestures: touch-action pan-y lets horizontal pointermove reach the
     gesture layer without browser pan/pointercancel; start-hit is geometry-only
     (45% viewport) with no hotspot element. */
  [data-mobile-nav="frame"] > :first-child {
    touch-action: pan-y !important;
  }

  @media (prefers-reduced-motion: reduce) {
    [data-mobile-nav="frame"] > :first-child {
      transition: none !important;
    }
  }

  /* Settings is the final drawer action. Give it the same phone gutters as
     the rest of the drawer and make its label a centered, full-width target.
     The trigger (ui-settings-general .trigger) is a full-width flex row with
     upstream left-aligned chrome: asymmetric padding (0 10px 0 8px) and a
     negative -2px inline margin. When the mobile rule centers that row, the
     leftover asymmetry pushes the centered icon+label group off the true
     center (it sits ~2px left of the drawer's centerline and the "Settings"
     text lands 11px right of it), and the negative margin overruns the 12px
     gutter by 2px each side. Normalize both so the row is flush to the gutter
     and the group reads as centered.
     The settings area sits inside the drawer's foot area (already inset
     12px each side), so it must NOT add its own padding-inline: the trigger
     width:100% of a padded box made the area 12px wider than the drawer
     (0-324 vs 312), pushing the Settings button to 24-312 — shifted right
     of the Files / Session log row (12-300). Drop the area's own inline
     padding and make it fill so the trigger lands at 12-300. */
  [data-mobile-nav="frame"] [class*="_settingsArea"] {
    padding-inline: 0 !important;
    width: 100% !important;
    box-sizing: border-box !important;
  }
  /* Settings primary inside Bento card — one notch bolder: elevated fill,
     l2 border + subtle shadow + 600 weight + 16px icon so it reads primary
     against the 36px secondary pills (13/500).
     The trigger is the ONLY settings-area button without data-phase: the
     ConnectionIndicator chip (Connecting…/Disconnected/Connected) carries
     data-phase="connecting|disconnected|recovered" (official ConnectionIndicator
     output) and must keep its own compact warning/success palette, NOT this
     stretch. Without the :not([data-phase]) guard the width:100% force hit the
     chip too (flex:none, so it could not shrink): the triggerRow overflowed
     (scrollW 402 vs clientW 238) and the Settings trigger crushed to 30px. */
  [data-mobile-nav="frame"] [class*="_settingsArea"] button:not([data-phase]):not([aria-modal="true"] *) {
    width: 100% !important;
    justify-content: flex-start !important;
    align-items: center !important;
    margin-inline: 0 !important;
    padding-inline: 14px !important;
    text-align: left !important;
    height: 42px !important;
    min-height: 42px !important;
    border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.14)) !important;
    background: var(--dsw-alias-button-elevated-fill, #ffffff) !important;
    border-radius: 12px !important;
    box-sizing: border-box !important;
    gap: 8px !important;
    font-size: 14px !important;
    line-height: 20px !important;
    font-weight: 600 !important;
    box-shadow: 0 1px 6px rgba(0,0,0,.06) !important;
  }
  [data-mobile-nav="frame"] [class*="_settingsArea"] button:not([data-phase]):not([aria-modal="true"] *):hover {
    background: var(--dsw-alias-button-floating-hover, rgba(0,0,0,.06)) !important;
  }
  [data-mobile-nav="frame"] [class*="_settingsArea"] button:not([data-phase]):not([aria-modal="true"] *) svg {
    width: 16px !important;
    height: 16px !important;
  }
  /* ConnectionIndicator beside Settings — the trigger row officially lays
     trigger + chip inline (flex row, gap 8), which cannot fit the ~300px
     drawer. When the chip renders, lift it to the TOP of the Bento foot
     card (Connecting…/Disconnected/Connected first, Files/Session log pills
     second, Settings last) instead of squeezing it beside/under the trigger:
     dissolve the settingsArea/triggerRow wrappers with display:contents so
     chip, pills and trigger become sibling flex items of the foot column,
     then order chip first (-1), trigger last (1). The chip keeps its own
     warn/success palette (its width:100% styling must NOT leak into the
     primary trigger — see the [data-phase] guard on the trigger rules). */
  [data-mobile-nav="frame"] [class*="_footArea"]:has([class*="_triggerRow"] > button[data-phase]) {
    gap: 8px !important;
  }
  [data-mobile-nav="frame"] [class*="_footArea"]:has([class*="_triggerRow"] > button[data-phase]) [class*="_settingsArea"],
  [data-mobile-nav="frame"] [class*="_footArea"]:has([class*="_triggerRow"] > button[data-phase]) [class*="_triggerRow"] {
    display: contents !important;
  }
  [data-mobile-nav="frame"] [class*="_footArea"]:has([class*="_triggerRow"] > button[data-phase]) [class*="_settingsArea"] button[data-phase] {
    order: -1 !important;
    flex: 0 0 auto !important;
    width: 100% !important;
    height: 36px !important;
    min-height: 36px !important;
    justify-content: flex-start !important;
    align-items: center !important;
    padding-inline: 14px !important;
    margin-inline: 0 !important;
    border-radius: 10px !important;
    box-sizing: border-box !important;
    gap: 6px !important;
    font-size: 13px !important;
    line-height: 20px !important;
    font-weight: 500 !important;
    text-align: left !important;
  }
  [data-mobile-nav="frame"] [class*="_footArea"]:has([class*="_triggerRow"] > button[data-phase]) [class*="_settingsArea"] button:not([data-phase]) {
    order: 1 !important;
    flex: 0 0 auto !important;
  }
  /* Maestro in footer.action must match Settings trigger on mobile — same 42h left-align */
  [data-mobile-nav="frame"] [data-maestro-trigger] {
    width: 100% !important;
    justify-content: flex-start !important;
    margin-inline: 0 !important;
    padding-inline: 12px !important;
    text-align: left !important;
    height: 42px !important;
    border-radius: 12px !important;
    gap: 8px !important;
  }

  /* Bento Foot Card (B): footArea becomes a card grouping Files|Session log pills + Settings.
     The card sits inside the already-inset drawer (12px gutters), so no extra outer margin.
     Tokens: bg-layer-2, border-l1, r14, label/interactive tokens. */
  [data-mobile-nav="frame"] [class*="_footArea"] {
    background: var(--dsw-alias-bg-layer-2, #f5f5f5) !important;
    border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.08)) !important;
    border-radius: 14px !important;
    padding: 10px !important;
    box-sizing: border-box !important;
    flex-direction: column !important;
  }
  [data-mobile-nav="frame"] [class*="_footArea"] [class*="_footerActions"] {
    display: flex !important;
    flex-direction: column !important;
    gap: 8px !important;
    width: 100% !important;
  }

  /* Drag handles are useless on touch and would float over the drawer. */
  [data-side="sidebar"],
  [data-side="details"] {
    display: none !important;
  }

  /* --- Conversation text on mobile ---
     The official message flow keeps desktop's 32px side gutters and 16px
     type. On a phone: shrink the type a notch and widen the lines by
     trimming the gutters (the sidebar drawer list keeps its size). The
     flow's scroll container is the only _scroll element holding markdown
     <p> paragraphs — the composer's own scroll (textarea) is excluded
     via :has(p). */
  /* The official main scroll body reserves scrollbar-gutter for desktop
     scrollbars (8px), which shoves every column off-center on a phone.
     Classic desktop scrollbars (Edge/Chrome) also occupy ~8-17px in a
     phone-sized viewport, shifting the column further. Mobile scrolling
     is touch/wheel, so remove the scrollbar entirely on phones: the
     column is then exactly centered in every browser. */
  [data-phase] [class*="_scrollBody"] {
    scrollbar-gutter: auto !important;
    scrollbar-width: none;
  }
  [data-phase] [class*="_scrollBody"]::-webkit-scrollbar {
    display: none !important;
    width: 0;
    height: 0;
  }
  /* Message action rows (copy / run-time badges) can overflow the right
     edge on narrow screens — keep them inside the message width. */
  [data-phase] [class*="_actions"] {
    overflow: hidden;
  }
  [data-phase] [class*="_actions"] [class*="_timeEnd"] {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap !important;
  }

  [data-phase] [class*="_scroll"]:not([class*="_scrollBody"]):has(p) {
    padding-left: 20px;
    padding-right: 20px;
    font-size: 15px !important;
  }
  /* The official markdown styles set an explicit 16px on paragraphs and
     list items, so the container's inherited 15px is not enough. User
     messages render their text in a div whose class carries _text_
     (16px too) — cover it as well. */
  [data-phase] [class*="_scroll"]:not([class*="_scrollBody"]):has(p) p,
  [data-phase] [class*="_scroll"]:not([class*="_scrollBody"]):has(p) li,
  [data-phase] [class*="_scroll"]:not([class*="_scrollBody"]):has(p) [class*="_text_"] {
    font-size: 15px !important;
  }

  /* Markdown tables: the official table uses width:max-content, so on a phone
     it hugs the content and leaves dead space beside/inside the table. Force
     the table to fill the message column and let the table wrapper handle
     overflow if a cell is genuinely too wide. */
  [data-phase] table {
    width: 100%;
    max-width: 100%;
  }
  [data-phase] th,
  [data-phase] td {
    max-width: none;
    min-width: 0;
  }

  /* Markdown images: the official rule often forces width:100%, which
     upscales small square images to the full message column. Show small
     images at their intrinsic size; large / very wide images still scale
     down to fit the column (max-width:100% keeps horizontal panoramas
     adaptive without overflowing). */
  [data-phase] [class*="_scroll"]:not([class*="_scrollBody"]) img {
    width: auto !important;
    max-width: 100% !important;
    height: auto !important;
    /* Cap square / tall images so a big sticker does not dominate the
       narrow column; landscape images stay governed by max-width only.
       The plain px line is the fallback for engines without dvh. */
    max-height: 220px !important;
    max-height: min(40dvh, 220px) !important;
  }

  /* User bubbles: the official stack is capped at min(525px, 82%), which on a
     phone leaves a large blank strip on the left and pushes the bubble high.
     On mobile let the user message fill the same full width as assistant
     messages (the bubble background then spans the whole message column). */
  [data-phase] [class*="_userStack"],
  [data-phase] [class*="_userStack"] [class*="_bubble"] {
    box-sizing: border-box;
    width: fit-content;
    max-width: 100%;
  }

  /* --- Composer bottom row on mobile ---
     The official row contains two lanes: tools (plus + permission/mode
     controls) and trailing (model + context + send). The previous rules made
     the modes lane flex:none, so its full intrinsic width collided with the
     model selector on narrow phones. Keep fixed hit targets fixed, but let
     text-bearing controls shrink and ellipsize before they paint over the
     trailing lane. */
  /* The home indicator belongs to the composer seat, not the AppFrame. The
     seat is the only element anchored to the bottom of an active conversation
     (position: sticky; bottom: 0); a margin-bottom on the input card clears
     only that card's own box, so the composer content still rides over the
     gesture bar. The AppFrame must never own the inset or it changes the
     absolute sidebar drawer's containing block / clips its settings panel.
     Padding the seat's bottom (viewport-fit=cover makes
     env(safe-area-inset-bottom) the real indicator height) lifts the whole
     composer footer above the home indicator. */
  [data-phase="active"] [data-composer-seat] {
    padding-bottom: max(12px, env(safe-area-inset-bottom, 0px)) !important;
  }
  [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) {
    box-sizing: border-box;
    container-type: inline-size;
    container-name: dsh-mobile-composer;
    flex-wrap: nowrap;
    gap: 6px;
    padding-left: 6px;
    padding-right: 6px;
    /* The dropdown menu is absolutely positioned inside this row; any
       overflow: hidden here would clip it. Inner lanes keep their own
       overflow clipping, so the row itself can stay visible. */
    overflow: visible;
  }
  [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) > :first-child {
    flex: 0 1 auto;
    min-width: 0;
    gap: 6px;
    /* The permission dropdown (Menu, side: top) pops upward from inside the
       tools lane; overflow hidden here would crop it, same as the row. Text
       ellipsis is handled by the trigger label itself. */
    overflow: visible;
  }
  [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) > [class*="_trailing"] {
    flex: 1 1 auto;
    min-width: 0;
    gap: 6px;
    /* Must not clip the model dropdown; the model trigger clips its own label. */
    overflow: visible;
  }
  /* PermissionSelect / plan controls share the tools lane. Let the
     permission label use the remaining tools width, while the lower-priority
     plan slot keeps an icon-sized target instead of stealing model width. */
  [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) > :first-child > :nth-child(2) {
    flex: 0 1 auto;
    min-width: 0;
    max-width: none;
    gap: 4px;
    /* The permission Menu list (side: top) pops upward out of this lane;
       overflow hidden crops it. The trigger label clips its own text. */
    overflow: visible;
  }
  [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) > :first-child > :nth-child(2) > [class*="_trigger"] {
    flex: 1 1 auto;
    min-width: 28px;
    max-width: 100%;
    display: flex !important;
    overflow: hidden;
  }
  [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) > :first-child > :nth-child(2) > [class*="_trigger"] > [class*="_triggerLabel"] {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap !important;
  }
  /* Slot wrappers such as the live plan chip are not trigger elements. Do
     not force them into an icon-sized box: their child button would overflow
     that wrapper and paint over PermissionSelect. Keep the wrapper intrinsic;
     the model lane below is the one that sacrifices width. */
  [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) > :first-child > :nth-child(2) > :not([class*="_trigger"]) {
    flex: 0 1 auto;
    min-width: 34px;
    max-width: max-content;
    overflow: visible;
  }
  [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) > :first-child > :nth-child(2) > [class*="_wrap"] > [class*="_chip"] {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap !important;
  }
  @container dsh-mobile-composer (max-width: 359px) {
    [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) > :first-child > :nth-child(2) > [class*="_trigger"] > [class*="_triggerLabel"] {
      display: none !important;
    }
  }
  /* Model selector: flexible and shrinkable, but never clipped.
     The root must be overflow:visible so the dropdown menu can render.
     The trigger itself clips the label text. */
  [data-phase] [class*="_card"]:has(textarea) [class*="_root"]:has(> [class*="_trigger"][aria-haspopup="menu"]) {
    flex: 0 1 auto;
    min-width: 0;
    overflow: visible;
  }
  @container dsh-mobile-composer (max-width: 359px) {
    [data-phase] [class*="_card"]:has(textarea) [class*="_root"]:has(> [class*="_trigger"][aria-haspopup="menu"]) {
      flex-basis: auto;
    }
  }
  [data-phase] [class*="_card"]:has(textarea) [class*="_root"]:has(> [class*="_trigger"][aria-haspopup="menu"]) > [class*="_trigger"] {
    display: flex !important;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    overflow: hidden;
  }
  [data-phase] [class*="_card"]:has(textarea) [class*="_root"]:has(> [class*="_trigger"][aria-haspopup="menu"]) > [class*="_trigger"] > [class*="_triggerLabel"] {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap !important;
  }
  [data-phase] [class*="_card"]:has(textarea) [class*="_root"]:has(> [class*="_trigger"]):not(:has(> [class*="_trigger"][aria-haspopup="menu"])) {
    flex: 0 0 auto;
  }

  /* Model switcher menu: center the dropdown on the now-shrinkable trigger,
     but never let it exceed the viewport on narrow phones. */
  [data-phase] [class*="_card"]:has(textarea) [class*="_root"]:has(> [class*="_trigger"]) > [class*="_menu"] {
    left: 50% !important;
    right: auto !important;
    transform: translateX(-50%) !important;
    max-width: min(320px, calc(100vw - 16px));
    box-sizing: border-box;
  }

  /* --- Fix composer row overflow at narrow widths (320px-360px) ---
     Force every direct child of the tools and trailing lanes to shrink,
     so they can fit within the available space without causing horizontal
     overflow. The fixed-size icon buttons are exempt: officially both are
     flex:none at a fixed size (plus 28x28, send 34x34) and must stay put,
     not participate in adaptation. */
  [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) > :first-child > :not([class*="_add"]) {
    flex-shrink: 1;
    min-width: 0;
  }
  [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) > [class*="_trailing"] > :not([class*="_primary"]) {
    flex-shrink: 1;
    min-width: 0;
  }
  /* Pin the plus button at the left edge of the tools lane: official
     flex:none 28x28, never squeezed by narrower viewports. */
  [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) > :first-child > [class*="_add"] {
    flex: none;
  }
  /* The context meter in the trailing lane is another fixed-size icon
     control: its trigger is officially width:28px flex:none, but the root
     itself is shrinkable, so a squeezed root lets the trigger paint over
     the pinned send button. Keep the whole meter at its natural size; its
     trigger uses aria-haspopup="dialog", so the model-selector menu rules
     (keyed on "menu") still do not apply. */
  [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) > [class*="_trailing"] > [class*="_root"] {
    flex: none;
    min-width: 0;
  }
  /* ContextMeter (JObwrW_ hash family) right-cluster pinning: keep the meter
     at its official size (28x28 trigger, 14px ring -- enlarging the ring made
     it steal attention) and glue it to the send button. A small negative
     right margin trims the 6px lane gap to 2px against send. Anchor on the
     unique aria-haspopup="dialog" trigger (no other composer control uses
     it), not the hashed class, so an upstream hash bump cannot silently
     unhook us. Knob: margin-right trim (-4px). */
  [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) > [class*="_trailing"] > [class*="_root"]:has(> [class*="_trigger"][aria-haspopup="dialog"]) {
    margin-right: -4px;
  }
  /* The model pill joins the same right cluster: its margin-left:auto absorbs
     ALL trailing slack, so the adaptive void sits between the tools lane and
     the pill (visible on wide phones/tablets), while [pill][meter][send] stay
     welded together at the right edge on every width. Descendant combinator
     on purpose: the pill root sits behind a display:contents wrapper, so a
     direct-child combinator silently misses (probe-verified). Within the
     trailing lane aria-haspopup="menu" belongs to the model trigger alone. */
  [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) > [class*="_trailing"] [class*="_root"]:has(> [class*="_trigger"][aria-haspopup="menu"]) {
    margin-left: auto;
    margin-right: -4px;
  }
  /* Shrink only the trigger BOX (28 -> 24, padding zeroed) while the ring
     ink stays at its official 14px: the dead inset per side drops from 7px
     to 5px so the small ring no longer floats in its own button. 24x24 keeps
     the WCAG 2.2 minimum target size. Ring size itself is intentionally
     untouched -- enlarging it was rejected as attention-grabbing. */
  [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) > [class*="_trailing"] > [class*="_root"]:has(> [class*="_trigger"][aria-haspopup="dialog"]) > [class*="_trigger"] {
    width: 24px;
    height: 24px;
    padding: 0;
  }
  /* Pin the send button to the right edge of the trailing lane.
     The model pill's margin-left:auto (rule above) is the primary slack
     absorber that keeps [pill][meter][send] welded at the right edge; this
     margin-left:auto only remains as the fallback for states where neither
     the pill nor the meter renders. The :has override zeroes it whenever
     either control is present, so two autos can never split the void and
     float the pill mid-lane. */
  [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) > [class*="_trailing"] > [class*="_primary"] {
    flex: none;
    margin-left: auto;
  }
  [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) > [class*="_trailing"]:has([class*="_trigger"][aria-haspopup="menu"], > [class*="_root"] > [class*="_trigger"][aria-haspopup="dialog"]) > [class*="_primary"] {
    margin-left: 0;
  }

  /* --- Session header on mobile ---
     Keep the host-owned metadata in one responsive row. The conversation
     title and running/subagent status keep their lanes; the mode text is the
     first to ellipsize when space runs out, while Files keeps its hit area. */
  [data-mobile-nav="frame"] [data-phase] header {
    padding-left: 16px;
    padding-right: 8px;
  }
  [data-mobile-nav="frame"] [data-phase] header > :first-child {
    display: flex !important;
    align-items: center;
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    gap: 2px;
    padding-left: 20px;
  }
  [data-mobile-nav="frame"] [data-phase] header > :first-child > :first-child {
    display: flex !important;
    align-items: center;
    flex: 1 1 auto;
    min-width: 0;
    gap: 2px;
  }
  /* The directory toggle stays at the far left of the header. */
  [data-mobile-nav="toggle"] {
    position: absolute !important;
    left: 8px !important;
    top: 12px !important;
    z-index: 2 !important;
  }
  /* Files remains in flow and is ordered as the rightmost plugin action. */
  [data-mobile-nav="files"] {
    position: static !important;
    left: auto !important;
    right: auto !important;
    top: auto !important;
    z-index: auto !important;
  }
  [data-mobile-nav="frame"] [data-phase] header [class*="_headerActions"] {
    display: flex !important;
    align-items: center;
    box-sizing: border-box;
    flex: 0 1 auto;
    min-width: 0;
    max-width: calc(100% - 32px);
    margin-left: auto;
    justify-content: flex-end;
    gap: 2px;
  }
  /* The title takes the remaining width and never paints outside it; the
     metadata lane's mode text is what shrinks first. */
  [data-mobile-nav="frame"] [data-phase] header [class*="_crumbs"] {
    flex: 1 1 0;
    min-width: 0;
    max-width: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap !important;
  }
  /* Mode label: preserve its icon and scale with the viewport — it yields
     space to the title and subagent status first, but can use more width on
     wider screens up to 220px before ellipsizing. */
  [data-mobile-nav="frame"] [data-phase] header [class*="_label"]:has(> svg) {
    order: 1;
    flex: 0 1 auto;
    min-width: 0;
    max-width: min(22vw, 220px);
    display: block;
    position: relative;
    box-sizing: border-box;
    padding-left: 18px;
    padding-right: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap !important;
  }
  [data-mobile-nav="frame"] [data-phase] header [class*="_label"]:has(> svg) > svg {
    position: absolute !important;
    left: 0 !important;
    top: 50% !important;
    transform: translateY(-50%) !important;
  }
  /* Running/subagent controls keep their full status text and hit area; they
     do not give up width to the mode label. NOTE: the real subagent lineage
     root has class="ZKlsPq_root " — a TRAILING SPACE from the plugin's
     template-literal className — so [class*="_root"] never matches it. Use
     [class*="_root"] and exclude the switcher root ([class*="_switcherRoot"])
     so only the count/job roots get pinned (the switcher must stay shrinkable
     so its own title can ellipsize). */
  [data-mobile-nav="frame"] [data-phase] header [class*="_root"]:not([class*="_switcherRoot"]):has(> button[class*="_trigger"]) {
    order: 2;
    flex: 0 0 auto;
    min-width: max-content;
    max-width: max-content;
    white-space: nowrap !important;
    position: static;
  }
  [data-mobile-nav="frame"] [data-phase] header [class*="_root"]:not([class*="_switcherRoot"]):has(> button[class*="_trigger"]) > button,
  [data-mobile-nav="frame"] [data-phase] header [class*="_root"]:not([class*="_switcherRoot"]):has(> button[class*="_trigger"]) > button * {
    white-space: nowrap !important;
  }
  /* The lineage count's leading "/" (ZKlsPq_separator — official desktop
     chrome rendered only for a root session inside the crumbs) looks like a
     stray extra breadcrumb level on small screens; hide it. The crumbSep "/"
     between ancestry segments (subagent sessions) is a real separator and
     stays. */
  [data-mobile-nav="frame"] [data-phase] header [class*="_crumbs"] [class*="_separator"] {
    display: none !important;
  }
  [data-mobile-nav="frame"] [data-phase] header [data-mobile-nav="files"] {
    order: 3;
    flex: 0 0 28px;
    width: 28px;
  }
  /* Session log download: gone from the header row on mobile (the utilities
     seat holds only the session-log-export capsule). */
  [data-mobile-nav="frame"] [data-phase] header > :first-child > :last-child {
    display: none !important;
  }
  /* Header crowding on narrow phones.
     A background-job trigger in the header actions, or the subagent lineage
     count ("N subagents") living inside the crumbs nav, consumes the width the
     mode label would otherwise use. This squeezes the crumbs nav so hard that
     the subagent count is clipped by the nav's overflow:hidden — the text
     looks overwritten and the trigger's right edge stops being reliably
     tappable. Mode text is the lowest-priority item, so it is compressed
     first. The lineage root (dsh-client-ui-subagent) sits in the crumbs for
     BOTH running and idle descendants, so we key the guards on that root
     rather than the transient running-state dot — otherwise the count gets
     clipped again the moment agents go idle. Match roots with
     [class*="_root"] (the real class carries a trailing space; [class*="_root"]
     matches nothing). */
  @media (max-width: 440px) {
    [data-mobile-nav="frame"] [data-phase] header [class*="_crumbs"] {
      padding-right: 8px;
    }
    [data-mobile-nav="frame"] [data-phase] header [class*="_headerActions"]:has([class*="_root"]) [class*="_label"]:has(> svg),
    [data-mobile-nav="frame"] [data-phase] header:has([class*="_crumbs"] [class*="_root"]) [class*="_label"]:has(> svg) {
      max-width: 18px;
      min-width: 18px;
      padding-left: 18px;
      padding-right: 0 !important;
    }
  }
  /* When the subagent lineage (any state) AND a background job are present
     together, even the mode icon is not enough room by itself. Keep the full
     subagent count (the reported-overwritten text) by compacting the job
     trigger to its dot/chevron, and keep mode icon-only so the crumbs nav can
     also hold a small right-hand gap — the subagent text should never sit
     flush against the mode component. */
  @media (max-width: 559px) {
    [data-mobile-nav="frame"] [data-phase] header [class*="_crumbs"] {
      padding-right: 8px;
    }
    [data-mobile-nav="frame"] [data-phase] header:has([class*="_crumbs"] [class*="_root"]) [class*="_headerActions"] [class*="_root"]:not([class*="_switcherRoot"]):has(> button[class*="_trigger"]) [class*="_count"] {
      display: none !important;
    }
    [data-mobile-nav="frame"] [data-phase] header:has([class*="_crumbs"] [class*="_root"]):has([class*="_headerActions"] [class*="_root"]) [class*="_label"]:has(> svg) {
      max-width: 18px;
      min-width: 18px;
      padding-left: 18px;
      padding-right: 0 !important;
    }
  }
  @media (max-width: 359px) {
    [data-mobile-nav="frame"] [data-phase] header:has([class*="_crumbs"] [class*="_root"]):has([class*="_headerActions"] [class*="_root"]) [class*="_label"]:has(> svg) {
      display: none !important;
    }
  }
  /* Session header tab row (Chat / Trajectory / Memory / Skills / Todos /
     plugin tabs). Upstream tabs are white-space:normal with
     flex:0 1 auto + min-width:auto, so when the row is narrower than the sum
     of the tab labels each tab shrinks to its single-longest-word min-content
     and the label wraps to several lines, while the row overflows to the right
     and the last tab paints past the viewport (unreachable). Force one line
     and horizontal scroll so every tab keeps its full label and stays reachable.
     Uses [class*="tabs"] scoped to the session header and the > [class*="tab"]
     direct children so the better-sidebar [class*="tabBar"] family is never hit;
     guard the active variant (still a plain tab) out of none. */
  [data-mobile-nav="frame"] [data-phase] header [class*="tabs"] {
    flex: 0 1 auto !important;
    min-width: 0 !important;
    max-width: 100% !important;
    overflow-x: auto !important;
    overflow-y: hidden !important;
    white-space: nowrap !important;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  [data-mobile-nav="frame"] [data-phase] header [class*="tabs"]::-webkit-scrollbar {
    display: none;
  }
  [data-mobile-nav="frame"] [data-phase] header [class*="tabs"] > [class*="tab"] {
    flex: 0 0 auto !important;
    min-width: max-content !important;
    max-width: max-content !important;
    white-space: nowrap !important;
  }

  /* --- Header popovers on mobile (dsh-client-ui-jobs / dsh-client-ui-subagent) --- */
  /* The official entries sit in the session header actions. Their popovers
     are anchored to the trigger's left edge, so clamp them to the viewport. */
  [data-mobile-nav="frame"] [data-phase] header [class*="_menu"] {
    left: 8px !important;
    right: auto !important;
    width: min(336px, calc(100vw - 16px));
    max-width: none;
    max-height: min(420px, calc(100dvh - 120px));
  }
  /* --- Settings sheet moved to settings-sheet.css.ts (DSH-native bottom sheet) ---
     Legacy aria-modal sheet rules removed — see src/client/styles/settings-sheet.css.ts
     for panel:has(navList) bottom-sheet, pill tabs scroll, header h44 close 36, safe-area.
     Keep cubeRow compact (Appearance) for any modal on mobile. */
  [aria-modal="true"] [class*="_cubeRow"] {
    gap: 6px;
  }
  [aria-modal="true"] [class*="_cubeRow"] > * {
    flex: 1 1 0;
    flex-direction: row !important;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 8px;
    min-height: 0;
  }

  /* Fix for dsh-better-sidebar (npm: dsh-better-sidebar) — right panel on mobile:
     make it a drawer (92vw) instead of full-viewport (100vw) so the dimmed
     backdrop beside it is tappable to close — otherwise the 100vw panel hides
     the backdrop entirely and chat appears permanently covered with no
     affordance to dismiss. Also constrain height for keyboard inset and hide
     the desktop drag handle which would float over the drawer. */
  [data-dsh-panel-host] [data-dsh-panel] {
    width: min(92vw, 360px) !important;
    max-width: 92vw !important;
    /* Keep content below the notch/status bar like the left drawer; the host
       is viewport-fixed so env(safe-area-inset-top) is real notch height. */
    padding-top: env(safe-area-inset-top, 0px) !important;
    /* Bottom safe-area for home indicator; also allows keyboard inset handling. */
    padding-bottom: env(safe-area-inset-bottom, 0px) !important;
  }
  /* Fix for dsh-better-sidebar — hide desktop resize handles on mobile. */
  [data-dsh-panel-host] [data-dsh-panel] [class*="panelResize"],
  [data-dsh-panel-host] [data-dsh-panel] [class*="cornerHandle"] {
    display: none !important;
  }
  /* Fix for dsh-better-sidebar — float windows must not cover the whole
     viewport on phones; constrain them like the panel drawer. */
  [data-dsh-panel-host] [class*="floatWindow"] {
    max-width: 92vw !important;
    max-height: 80dvh !important;
  }
  /* Fix for dsh-better-sidebar — bottom panel is merged into the right drawer
     on narrow viewports (JS does not render it), but keep a CSS guard so any
     stray bottom panel never overlays the center column on mobile. */
  [data-dsh-panel-host] [data-dsh-bottom-panel] {
    display: none !important;
  }
  /* Fix for dsh-better-sidebar — while the right panel drawer is open on
     mobile, hide the floating toggle cluster: the drawer is 92vw and covers
     the right edge, so the cluster (z45) floats over the panel header and its
     "Collapse sidebar" button overlaps the modal. Closing stays reachable via
     the tappable backdrop on the 8vw exposed strip. When the drawer is closed
     (the panel carries nArs4W_panelHidden) the cluster is shown again to
     reopen. Both the cluster and panel are direct children of
     [data-dsh-panel-host]. */
  [data-dsh-panel-host]:not(:has([class*="panelHidden"])) [data-dsh-toggle-cluster] {
    display: none !important;
  }
  /* Fix for dsh-better-sidebar — a mobile sheet (settings / explorer /
     preview) is a full-width aria-modal dialog. The floating toggle cluster is
     viewport-fixed at the top-right (z45), so once such a sheet is open it
     floats over the sheet's own top-right chrome (cf. the "Collapse sidebar"
     button overlapping the modal). The panel rule above only hides the cluster
     while the right panel drawer is open; this covers any modal that is NOT
     that panel (e.g. Settings opened from the left nav drawer), so the cluster
     disappears whenever an aria-modal dialog is present. */
  body:has([aria-modal="true"]) [data-dsh-toggle-cluster] {
    display: none !important;
  }
}

/* Fix for dsh-better-sidebar (npm: dsh-better-sidebar) — align the floating
   toggle cluster with the DSH header's session log button. Upstream places
   the cluster at top:3px, while the DSH header's actions sit at top:12-17px
   (center ~28px). With the cluster's 28px buttons, top:14px puts its center
   at 28px, visually aligned with the header's session log / headerActions
   and the crumb. Safe-area inset is preserved for notched devices. Applies
   to both mobile and desktop because the cluster is viewport-fixed. */
[data-dsh-toggle-cluster] {
  top: calc(14px + env(safe-area-inset-top, 0px)) !important;
}

/* Fix for dsh-better-sidebar (npm: dsh-better-sidebar) — align tabBar with
   the DSH header when the right panel is open. Upstream tabBar is 34px at
   y0 (center 17.5px) while the DSH header's interactive row is at top12-17
   (center 28px, session log button 32px at y12). Make the tabBar sit at the
   same 12px top with 32px height so its tabs share the header's baseline.
   Desktop only — mobile hides the tabBar behind the 92vw drawer. */
@media (min-width: 1024px) {
  /* The tabBar is the flex row; width 100% + align-items center so its tabs
     share the header's 12px-top baseline. Guard every selector that contains
     the "tabBar" or "tab" fragments with :not so the wider fragments
     (tabBarPlus / tabList / tabTitle / tabClose / tabBarRight) do not get
     re-matched by the shorter prefix — otherwise [class*="tab"] also hits
     nArs4W_tabList and stomps its flex-grow (see AGENTS.md prefix-overlap). */
  [data-dsh-panel] [class*="tabBar"]:not([class*="tabBarPlus"]):not([class*="tabBarRight"]) {
    height: 32px !important;
    min-height: 32px !important;
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    display: flex !important;
    flex: none !important;
    align-self: stretch !important;
    box-sizing: border-box !important;
    margin-top: 12px !important;
    margin-left: 0 !important;
    margin-right: 0 !important;
    padding-top: 0 !important;
    padding-bottom: 0 !important;
    padding-left: 12px !important;
    padding-right: 12px !important;
    align-items: center !important;
    justify-content: flex-start !important;
  }
  /* tabList grows to fill the tabBar (flex item, flex-grow 1). */
  [data-dsh-panel] [class*="tabBar"]:not([class*="tabBarPlus"]):not([class*="tabBarRight"]) [class*="tabList"] {
    height: 28px !important;
    min-height: 28px !important;
    flex: 1 1 auto !important;
    flex-grow: 1 !important;
    width: auto !important;
    min-width: 0 !important;
    align-items: center !important;
    gap: 8px !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
  }
  /* A single tab; guard every longer "tab"-fragment so this does not leak
     onto the tabList/tabTitle/tabClose/tabBarPlus siblings. */
  [data-dsh-panel] [class*="tabBar"]:not([class*="tabBarPlus"]):not([class*="tabBarRight"]) [class*="tab"]:not([class*="tabList"]):not([class*="tabTitle"]):not([class*="tabClose"]):not([class*="tabBarPlus"]):not([class*="tabBarRight"]) {
    height: 28px !important;
    min-height: 28px !important;
    flex: 0 1 auto !important;
    min-width: 0 !important;
    max-width: 180px !important;
    align-items: center !important;
    align-self: center !important;
  }
  [data-dsh-panel] [class*="tabBar"]:not([class*="tabBarPlus"]):not([class*="tabBarRight"]) [class*="tabTitle"] {
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
    min-width: 0 !important;
  }
  /* Fix for dsh-better-sidebar — New tab (+) button in the tabBar. Upstream
     renders it at 22x32 at y18 (center 34) while tabs are 80x18 at y19
     (center 28) — the + button sits 6px low and is not square. Make it a
     28px square and center it with the tabs. */
  [data-dsh-panel] [class*="tabBar"]:not([class*="tabBarRight"]) [class*="tabBarPlus"],
  [data-dsh-panel] [class*="tabBar"]:not([class*="tabBarRight"]) [class*="addTab"] {
    width: 28px !important;
    height: 28px !important;
    min-height: 28px !important;
    flex: none !important;
    margin: 0 !important;
    top: 0 !important;
    align-self: center !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
  }
}
`

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
     ConnectionIndicator chip (Connecting…/Disconnected) is a
     button[data-phase], while the recovered Connected confirmation is a
     div[role="status"] with NO data-phase (official ConnectionIndicator
     output) — both must keep their own compact warning/success palette,
     NOT this stretch. Without the :not([data-phase]) guard the width:100%
     force hit the chip too (flex:none, so it could not shrink): the
     triggerRow overflowed (scrollW 402 vs clientW 238) and the Settings
     trigger crushed to 30px. */
  [data-mobile-nav="frame"] [class*="_settingsArea"] button:not([data-phase]):not([aria-modal="true"] *) {
    width: 100% !important;
    justify-content: flex-start !important;
    align-items: center !important;
    margin-inline: 0 !important;
    padding-inline: 12px !important;
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
     primary trigger — see the [data-phase] guard on the trigger rules).
     The chip matcher covers BOTH official shapes: button[data-phase] for
     Connecting/Disconnected and div[role="status"] for the recovered
     Connected confirmation, which carries no data-phase. */
  [data-mobile-nav="frame"] [class*="_footArea"]:has([class*="_triggerRow"] > :is(button[data-phase], div[role="status"])) {
    gap: 8px !important;
  }
  [data-mobile-nav="frame"] [class*="_footArea"]:has([class*="_triggerRow"] > :is(button[data-phase], div[role="status"])) [class*="_settingsArea"],
  [data-mobile-nav="frame"] [class*="_footArea"]:has([class*="_triggerRow"] > :is(button[data-phase], div[role="status"])) [class*="_triggerRow"] {
    display: contents !important;
  }
  [data-mobile-nav="frame"] [class*="_footArea"]:has([class*="_triggerRow"] > :is(button[data-phase], div[role="status"])) [class*="_settingsArea"] :is(button[data-phase], div[role="status"]) {
    order: -1 !important;
    flex: 0 0 auto !important;
    width: 100% !important;
    height: 36px !important;
    min-height: 36px !important;
    justify-content: flex-start !important;
    align-items: center !important;
    padding-inline: 12px !important;
    margin-inline: 0 !important;
    border-radius: 10px !important;
    box-sizing: border-box !important;
    gap: 6px !important;
    font-size: 13px !important;
    line-height: 20px !important;
    font-weight: 500 !important;
    text-align: left !important;
  }
  [data-mobile-nav="frame"] [class*="_footArea"]:has([class*="_triggerRow"] > :is(button[data-phase], div[role="status"])) [class*="_settingsArea"] button:not([data-phase]) {
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
    padding: 12px !important;
    box-sizing: border-box !important;
    flex-direction: column !important;
  }
  [data-mobile-nav="frame"] [class*="_footArea"] [class*="_footerActions"] {
    display: flex !important;
    flex-direction: column !important;
    gap: 8px !important;
    width: 100% !important;
  }

  /* Drag handles are useless on touch and would float over the drawer.
     AppFrame tags its two handles with data-side="sidebar" | "rightbar"
     (the pre-0.1.5 "details" name no longer exists). */
  [data-side="sidebar"],
  [data-side="rightbar"] {
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

  /* --- Composer model selector: long names must not drop the toolbar to 2 lines ---
     The host ModelSelect trigger (class *_trigger) carries a long model label
     (e.g. "KiraAI - Hy3 Super Extended Reasoning Model"). The label already
     ellipsizes (nowrap + ellipsis), but the host makes the composer row
     flex-wrap and the trailing group flex:0 0 auto with the trigger given no
     min-width:0, so the row cannot shrink the model name and the whole
     trailing lane (model + send) wraps to a second line on narrow phones
     (verified live: rowH 42 -> 82px for a long name). Keep the toolbar on a
     single line and let the model name ellipsize in place: pin the row to
     nowrap, make the trailing lane shrinkable, and force the trigger + label
     to collapse. Scoped to the composer seat; the fixed hit targets (send
     circle, context, permission) keep flex:none so only the model label
     yields. */
  [data-composer-seat] [class*="_row"] {
    flex-wrap: nowrap !important;
    padding-left: 4px !important;
    padding-right: 4px !important;
  }
  [data-composer-seat] [class*="_trailing"] {
    flex: 0 1 auto !important;
    min-width: 0 !important;
    gap: 6px !important;
  }
  /* Scope to triggers that carry a label (model + permission selects). The
     context-meter gauge trigger is a fixed 28px circle with no label and must
     keep its flex:none, so it must not be pulled into this shrink rule. */
  [data-composer-seat] [class*="_trigger"]:has([class*="_triggerLabel"]) {
    min-width: 0 !important;
    flex: 0 1 auto !important;
  }
  [data-composer-seat] [class*="_triggerLabel"] {
    min-width: 0 !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }
  /* Effort value (e.g. "High") sits beside the model name inside the model
     trigger. The host gives it flex:0 0 auto but no white-space, so a long
     model name that caps the trigger lets the effort text wrap to a second
     line and grows the toolbar. Pin it to one line; the model label is the
     only part that should ellipsize. */
  [data-composer-seat] [class*="_triggerEffort"] {
    white-space: nowrap !important;
    flex: 0 0 auto !important;
  }
  [data-composer-seat] [class*="_tools"] {
    gap: 6px !important;
  }
  [data-composer-seat] [class*="_modes"] {
    gap: 4px !important;
  }

  /* --- Session header on mobile ---
     Keep the host-owned metadata in one responsive row. The conversation
     title and running/subagent status keep their lanes; the mode text is the
     first to ellipsize when space runs out, while Files keeps its hit area.
     Every selector below is anchored on the session header through its slot
     seat (data-slot="conversation.session.header", the display:contents
     wrapper that receives the seat). A plain descendant header also matched
     every other <header> rendered inside the active conversation — most
     visibly the Ask card (ask_user_question), whose own <header> then became
     a flex row: its heading block got width:100% + padding-left:20px, the
     eyebrow collapsed to a zero-width flex item, and the <h2> question
     turned into a flex item with min-width:auto, so a long question or any
     unbreakable token painted ~1100px wide and was clipped by the card's
     overflow:hidden (mobile report 2026-09-11). Keep the seat anchor. */
  [data-mobile-nav="frame"] [data-phase] [data-slot="conversation.session.header"] > header {
    padding-left: 16px;
    padding-right: 8px;
  }
  [data-mobile-nav="frame"] [data-phase] [data-slot="conversation.session.header"] > header > :first-child {
    display: flex !important;
    align-items: center;
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    gap: 2px;
    padding-left: 20px;
  }
  [data-mobile-nav="frame"] [data-phase] [data-slot="conversation.session.header"] > header > :first-child > :first-child {
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
  /* DSH already ships a right-sidebar toggle in the session-header corner —
     button[data-sidebar-right-expand], aria-label "Open right sidebar" ⟷
     "Collapse right sidebar" — but hides the whole corner below its own
     breakpoint. The header ⋯ menu only ever opened a single entry ("Download
     session log") that already exists as the drawer-footer Session log
     button, so its right-hand slot now hosts the panel toggle instead:
     reachable one-handed, and it reuses upstream's own open/collapse state
     rather than adding a second control or duplicating the i18n. */
  [data-mobile-nav="frame"] [data-phase] [data-slot="conversation.session.header"] > header [data-conversation-header-corner] {
    display: block !important;
    position: absolute !important;
    right: 8px !important;
    top: 12px !important;
    /* Upstream gives this corner margin-left 8px / margin-right -16px for its
       in-flow desktop seat. An absolutely-positioned box resolves the right
       offset against its margin edge, so the -16px would push the button 16px
       past the gutter (x=370 instead of x=354) and off the 390px viewport. */
    margin-inline: 0 !important;
    z-index: 2 !important;
  }
  /* The ⋯ menu itself is redundant once its slot is reused. Matched by class
     substring: the hash changes per build and the aria-label ("More actions")
     changes per locale. */
  [data-mobile-nav="frame"] [data-phase] [data-slot="conversation.session.header"] > header [class*="moreButton"] {
    display: none !important;
  }
  /* Reserve the corner toggle's 28px plus its 8px gutter, or the
     absolutely-positioned button lands on the workspace/chevron cluster. */
  [data-mobile-nav="frame"] [data-phase] [data-slot="conversation.session.header"] > header [class*="_titleRow"] {
    padding-right: 36px !important;
  }
  [data-mobile-nav="frame"] [data-phase] [data-slot="conversation.session.header"] > header [class*="_headerActions"] {
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
  [data-mobile-nav="frame"] [data-phase] [data-slot="conversation.session.header"] > header [class*="_crumbs"] {
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
  [data-mobile-nav="frame"] [data-phase] [data-slot="conversation.session.header"] > header [class*="_label"]:has(> svg) {
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
  [data-mobile-nav="frame"] [data-phase] [data-slot="conversation.session.header"] > header [class*="_label"]:has(> svg) > svg {
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
  [data-mobile-nav="frame"] [data-phase] [data-slot="conversation.session.header"] > header [class*="_root"]:not([class*="_switcherRoot"]):has(> button[class*="_trigger"]) {
    order: 2;
    flex: 0 0 auto;
    min-width: max-content;
    max-width: max-content;
    white-space: nowrap !important;
    position: static;
  }
  [data-mobile-nav="frame"] [data-phase] [data-slot="conversation.session.header"] > header [class*="_root"]:not([class*="_switcherRoot"]):has(> button[class*="_trigger"]) > button,
  [data-mobile-nav="frame"] [data-phase] [data-slot="conversation.session.header"] > header [class*="_root"]:not([class*="_switcherRoot"]):has(> button[class*="_trigger"]) > button * {
    white-space: nowrap !important;
  }
  /* The lineage count's leading "/" (ZKlsPq_separator — official desktop
     chrome rendered only for a root session inside the crumbs) looks like a
     stray extra breadcrumb level on small screens; hide it. The crumbSep "/"
     between ancestry segments (subagent sessions) is a real separator and
     stays. */
  [data-mobile-nav="frame"] [data-phase] [data-slot="conversation.session.header"] > header [class*="_crumbs"] [class*="_separator"] {
    display: none !important;
  }
  /* The header's trailing corner used to be hidden here ("session log download
     is gone from the header row on mobile" — the utilities seat held only the
     session-log-export capsule). DSH now puts the right-sidebar toggle in that
     corner slot, so it is no longer hidden: the rule further up un-hides it
     into the slot the redundant ⋯ menu vacated. Nothing else lives in the
     corner (verified on 0.1.5: one slot, one button[data-sidebar-right-expand]). */
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
    [data-mobile-nav="frame"] [data-phase] [data-slot="conversation.session.header"] > header [class*="_crumbs"] {
      padding-right: 8px;
    }
    [data-mobile-nav="frame"] [data-phase] [data-slot="conversation.session.header"] > header [class*="_headerActions"]:has([class*="_root"]) [class*="_label"]:has(> svg),
    [data-mobile-nav="frame"] [data-phase] [data-slot="conversation.session.header"] > header:has([class*="_crumbs"] [class*="_root"]) [class*="_label"]:has(> svg) {
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
    [data-mobile-nav="frame"] [data-phase] [data-slot="conversation.session.header"] > header [class*="_crumbs"] {
      padding-right: 8px;
    }
    [data-mobile-nav="frame"] [data-phase] [data-slot="conversation.session.header"] > header:has([class*="_crumbs"] [class*="_root"]) [class*="_headerActions"] [class*="_root"]:not([class*="_switcherRoot"]):has(> button[class*="_trigger"]) [class*="_count"] {
      display: none !important;
    }
    [data-mobile-nav="frame"] [data-phase] [data-slot="conversation.session.header"] > header:has([class*="_crumbs"] [class*="_root"]):has([class*="_headerActions"] [class*="_root"]) [class*="_label"]:has(> svg) {
      max-width: 18px;
      min-width: 18px;
      padding-left: 18px;
      padding-right: 0 !important;
    }
  }
  @media (max-width: 359px) {
    [data-mobile-nav="frame"] [data-phase] [data-slot="conversation.session.header"] > header:has([class*="_crumbs"] [class*="_root"]):has([class*="_headerActions"] [class*="_root"]) [class*="_label"]:has(> svg) {
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
     direct children so no other [class*="tab"] family is hit;
     guard the active variant (still a plain tab) out of none. */
  [data-mobile-nav="frame"] [data-phase] [data-slot="conversation.session.header"] > header [class*="tabs"] {
    flex: 0 1 auto !important;
    min-width: 0 !important;
    max-width: 100% !important;
    overflow-x: auto !important;
    overflow-y: hidden !important;
    white-space: nowrap !important;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  [data-mobile-nav="frame"] [data-phase] [data-slot="conversation.session.header"] > header [class*="tabs"]::-webkit-scrollbar {
    display: none;
  }
  [data-mobile-nav="frame"] [data-phase] [data-slot="conversation.session.header"] > header [class*="tabs"] > [class*="tab"] {
    flex: 0 0 auto !important;
    min-width: max-content !important;
    max-width: max-content !important;
    white-space: nowrap !important;
  }

  /* --- Header popovers on mobile (dsh-client-ui-jobs / dsh-client-ui-subagent) --- */
  /* The official entries sit in the session header actions. Their popovers
     are anchored to the trigger's left edge, so clamp them to the viewport.
     The background-job popover is re-docked below (it needs more than a clamp);
     this stays for the other header popovers. */
  [data-mobile-nav="frame"] [data-phase] [data-slot="conversation.session.header"] > header [class*="_menu"] {
    left: 8px !important;
    right: auto !important;
    width: min(336px, calc(100vw - 16px));
    max-width: none;
    max-height: min(420px, calc(100dvh - 120px));
  }
  /* --- Background-job control (dsh-client-ui-jobs) ---
     Upstream pins the labelled trigger at max-content width: with one job
     running it measured 179x28px inside the 390px header and crushed the
     session title (crumbs) to 30px, which is what the session header's own
     crowding rules were compensating for elsewhere. Collapse it to the same
     28px circle as the drawer and right-sidebar toggles and keep the count as
     a badge. The accessible name is untouched, so the sentence upstream
     renders stays available to assistive tech. */
  [data-mobile-nav="jobs"] {
    display: inline-grid !important;
    place-items: center !important;
    box-sizing: border-box !important;
    position: relative !important;
    width: 28px !important;
    height: 28px !important;
    min-height: 28px !important;
    padding: 0 !important;
    gap: 0 !important;
    border-radius: 999px !important;
  }
  /* The sentence and the chevron are what made the control wide; the badge and
     the dots carry the state instead. */
  [data-mobile-nav="jobs"] [class*="_count"],
  [data-mobile-nav="jobs"] > svg {
    display: none !important;
  }
  /* An idle session renders no state dot (upstream draws one only for a live
     job), so the control would collapse to a bare badge: keep a neutral dot as
     its glyph, and let the live dot take over as soon as one appears. */
  [data-mobile-nav="jobs"]:not(:has([class*="_triggerDot"]))::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--dsw-alias-label-dimmed, #b9bdc4);
  }
  [data-mobile-nav="jobs"]::after {
    content: attr(data-jobs-count) !important;
    position: absolute !important;
    top: -3px !important;
    right: -4px !important;
    box-sizing: border-box !important;
    min-width: 15px !important;
    height: 15px !important;
    padding: 0 3px !important;
    border-radius: 999px !important;
    background: var(--dsw-alias-state-business-primary, #4f6ef7);
    color: var(--dsw-alias-label-primary-foreground, #ffffff);
    font-size: 10px !important;
    line-height: 15px !important;
    font-weight: 600 !important;
    text-align: center !important;
  }
  /* Dock the job list under the session header. Upstream anchors this popover
     to the jobs root, but the header-crowding rule above sets that root to
     position: static, so the absolute panel resolved against a distant
     containing block and rendered at y=849 — entirely below the 844px viewport,
     which is the reported "open it and the list is not there". Fixed
     positioning ignores both the lost anchor and the overflow:hidden ancestors
     ([data-phase], .centerCol); 76px is the header's own min-height and the
     safe-area inset keeps the panel below a notched status bar. Full width, so
     the mono job labels keep every pixel a phone can give them. */
  [data-mobile-nav="frame"] [data-phase] [data-slot="conversation.session.header"] > header [class*="_root"]:has(> [data-mobile-nav="jobs"]) > ul[class*="_menu"] {
    position: fixed !important;
    top: calc(76px + env(safe-area-inset-top, 0px)) !important;
    left: 8px !important;
    right: 8px !important;
    width: auto !important;
    max-width: none !important;
    max-height: min(420px, calc(100dvh - 92px - env(safe-area-inset-top, 0px))) !important;
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

}

`

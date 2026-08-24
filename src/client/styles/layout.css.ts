// layout — split from src/client/mobile.css.ts (2026-08-16), order preserved.
// Self-contained: the mobile media query opens and closes in this file.

export const LAYOUT_CSS = `/* ---------- mobile-only layout ---------- */

@media (max-width: 1023px) {
  /* --- Phone chrome ---
     The system status bar stays visible (no fullscreen). Two adjustments
     make it behave:
     - touch-action: manipulation kills double-tap-to-zoom (and the 300ms
       tap delay) while keeping pan and pinch zoom; the client also
       suppresses legacy-iOS gesturestart as a fallback.
     - With the client's viewport-fit=cover, env(safe-area-inset-top) is the
       status bar / notch height; the rules below push the app content below
       it so the status bar never covers anything. Off notched phones (or in
       a normal browser tab where the layout viewport already sits below the
       status bar) the inset is 0 and nothing shifts. */
  html,
  body {
    touch-action: manipulation !important;
  }

  /* AppFrame: the drawer takes the sidebar column out of grid flow, so the
     remaining in-flow items (center, details) land in tracks 1..2: give the
     center every pixel and keep the details track at zero. Its top safe-area
     padding clears the status bar / notch for every in-flow surface. The
     composer owns the bottom safe-area so drawer geometry stays independent
     of the iPhone home indicator. */
  [data-mobile-nav="frame"] {
    position: relative !important;
    grid-template-columns: minmax(0, 1fr) 0 0 !important;
    padding-top: env(safe-area-inset-top, 0px) !important;
  }

  /* The sidebar column (first grid child) becomes a left drawer. The drawer is
     a fixed ~80vw box (not max-content): the sidebar content carries an inline
     width (~280px) that would otherwise leave the drawer hugging its content
     and copying the cramped desktop rail onto a phone. A wider drawer needs
     the content to stretch into it, so a companion rule below forces the
     content column (regionArea/root/listArea/treeBody) and its rows to 100%.
     Closed state: translateX(-110%) — more than -100% of the drawer width —
     guarantees the whole drawer (and its shadow, had it one) leaves the
     viewport. A mere -100% leaves a sliver on screen; -105% (as used before)
     left the drawer plus a long 32px-blur shadow gradient visible along the
     left edge of the main UI. No box-shadow at all: the dimmed backdrop
     already separates drawer from content. */
  [data-mobile-nav="frame"] > :first-child {
    position: absolute !important;
    inset: 0 auto 0 0 !important;
    width: min(80vw, 360px);
    max-width: 92vw;
    z-index: 40 !important;
    transform: translateX(-110%);
    transition: transform .28s var(--ds-ease-in-out, ease-in-out);
    background: var(--dsw-alias-bg-base, #ffffff);
    /* Keep the drawer's own content below the status bar / notch: the drawer
       spans the full frame height (its absolute containing block is the
       frame's padding box, so the frame's own safe-area padding does NOT
       reach it). The drawer background paints the status-bar strip, which
       the client's theme-color meta matches, so the strip reads seamless. */
    padding-top: env(safe-area-inset-top, 0px) !important;
    /* Kill the official sidebarCol right border: with the backdrop the edge
       reads cleanly, and the settings dialog (width:100% of this box) stays
       pixel-flush with the drawer. */
    border-right: none !important;
  }

  /* The drawer is a fixed ~80vw box, but the sidebar content column is
     max-content: on its own it hugs ~280px and leaves a blank strip beside it.
     Cascade width:100% down the content column (regionArea -> root -> listArea
     -> treeBody) and to the rows / create button so the content stretches to
     fill the wider drawer. Do NOT blanket-width all buttons/sections: the
     brand header and the icon buttons (collapse, search, filter) must stay
     content-sized. */
  [data-mobile-nav="frame"] > :first-child :is([class*="_regionArea"],[class*="_listArea"],[class*="_treeBody"],[class*="_root"]) {
    width: 100% !important;
  }
  [data-mobile-nav="frame"] > :first-child [class*="_newSession"] {
    width: 100% !important;
  }

  /* The workspace/session tree root carries a reserved right gutter
     (padding-right:12px) for a stable scrollbar. With a wider drawer the
     content column already stretches to 100%, but that gutter keeps the
     session rows inside it ~4px short of the drawer content edge (and, when
     the list is long enough to scroll, a classic scrollbar can ride over the
     timestamps). Drop the session root's own right gutter so the rows reach
     the content edge; scope to the regionArea so only the session tree's root
     is touched (the header root jR4zTa_root is its parent, not a descendant).
     Do NOT also force width:100% on the rows themselves — that, combined with
     the row's content-box padding, would over-extend the rows past the drawer
     (300 -> 312). */
  [data-mobile-nav="frame"] > :first-child [class*="_regionArea"] [class*="_root"] {
    padding-right: 0 !important;
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
  [data-mobile-nav="frame"] [class*="_settingsArea"] button {
    width: 100% !important;
    justify-content: center !important;
    margin-inline: 0 !important;
    padding-inline: 0 !important;
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
     the pinned send button. Keep the whole meter at its natural size; it
     has no aria-haspopup marker, so the model-selector rules do not apply. */
  [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) > [class*="_trailing"] > [class*="_root"] {
    flex: none;
    min-width: 0;
  }
  /* Pin the send button to the right edge of the trailing lane.
     The lane is stretched (flex:1 1 auto) so leftover space would otherwise
     pile up on its right and let the button drift as model/context labels
     change size. margin-left:auto absorbs that free space, keeping the
     button glued to the right edge at its official fixed 34x34 size. */
  [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) > [class*="_trailing"] > [class*="_primary"] {
    flex: none;
    margin-left: auto;
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
  /* --- Settings dialog on mobile ---
     Desktop: 800px two-column flex (188px nav + content). Mobile: a
     near-full-width sheet — nav tabs wrap into rows on top, option rows
     stay horizontal (title+description left, control right). Structural
     selectors are scoped to the unique aria-modal dialog; every
     settings-specific rule is gated with
     :has(> :first-child > :last-child > button) — the settings nav tab
     list holds <button> tabs, so the transient export dialog (the same
     primitives Modal, header(title+close)+description+body) keeps its
     official centered card layout. Requires :has() support
     (Chromium 105+, 2022).

     The directory picker (dsh-client-ui-directory-picker-browse) must be
     excluded too: its footer bar holds <button> children AND its breadcrumb
     trail (role="navigation") — which the role gate relies on to exclude
     it — is REPLACED by the path input in edit mode (pencil button), so
     without the ZuhsRW exclusion clicking the pencil would suddenly match
     this sheet rule: the dialog jumps to the top of the screen, the header
     (with the path input) is hidden by the > :first-child > :first-child
     display:none rule below, and the user can no longer type a path
     (issue #12, 2026-08-16). The picker family keeps the official layout
     on mobile in every mode. */
  [aria-modal="true"]:has(> :first-child > :last-child > button):not(:has([role="navigation"])):not(:has([class*="ZuhsRW"])) {
    position: absolute !important;
    left: 8px !important;
    /* Fixed top (no translateY): a transform on the panel combined with the
       panel overflowing the max-content drawer shifts the fixed overlay's
       coordinate frame, dragging the whole sidebar content off-screen. The
       safe-area inset keeps the sheet below the status bar / notch. */
    top: calc(env(safe-area-inset-top, 0px) + 12px) !important;
    width: calc(100vw - 16px);
    max-width: calc(100vw - 16px);
    /* Height follows the content (no dead space under a short page); it
       caps at 100dvh-24 (less the safe-area top) and the options area
       scrolls only then. */
    height: auto;
    max-height: min(800px, calc(100vh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)));
    max-height: min(800px, calc(100dvh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)));
    flex-direction: column !important;
    border-radius: 14px !important;
    animation: dsh-maestro-mobile-sheet-in .22s var(--ds-ease-out, ease-in-out);
  }
  /* The settings sheet's dimmed mask fades in with the panel (the mask is
     the first child of the overlay that directly contains the sheet). */
  :has(> [aria-modal="true"]:has(> :first-child > :last-child > button):not(:has([role="navigation"])):not(:has([class*="ZuhsRW"]))) > :first-child {
    animation: dsh-maestro-mobile-fade .18s var(--ds-ease-out, ease-in-out);
  }
  @media (prefers-reduced-motion: reduce) {
    [aria-modal="true"]:has(> :first-child > :last-child > button):not(:has([role="navigation"])):not(:has([class*="ZuhsRW"])),
    :has(> [aria-modal="true"]:has(> :first-child > :last-child > button):not(:has([role="navigation"])):not(:has([class*="ZuhsRW"]))) > :first-child {
      animation: none !important;
    }
  }
  /* The export dialog (not the settings sheet) must never overflow the
     viewport: the official centered card can be wider than 390px. */
  [aria-modal="true"]:not(:has(> :first-child > :last-child > button)) {
    max-width: calc(100vw - 32px);
  }
  /* Nav bar: hide the "Settings" caption (redundant on a full-width sheet)
     and wrap the tab list so every tab is visible — a horizontal scroll cut
     the last tab ("Plugins") off with no affordance to scroll. */
  [aria-modal="true"]:has(> :first-child > :last-child > button):not(:has([role="navigation"])):not(:has([class*="ZuhsRW"])) > :first-child {
    width: 100%;
    flex-direction: row !important;
    align-items: center;
    gap: 6px;
    padding: 10px 12px 8px;
  }
  [aria-modal="true"]:has(> :first-child > :last-child > button):not(:has([role="navigation"])):not(:has([class*="ZuhsRW"])) > :first-child > :first-child {
    display: none !important;
  }
  /* The tab list scrolls in the space left by the toolbar: the toolbar
     (config file + close) is reparented INTO this nav row by a client
     reconciler task (settings-toolbar-reparent), so the tab list must be
     anchored by its class, NOT by :last-child (the reparented toolbar
     becomes the nav's new last child). */
  [aria-modal="true"]:has(> :first-child > :last-child > button):not(:has([role="navigation"])):not(:has([class*="ZuhsRW"])) > :first-child [class*="_navList"] {
    flex: 1 1 auto;
    min-width: 0;
    flex-direction: row !important;
    flex-wrap: wrap;
    gap: 6px;
    overflow: visible;
  }
  /* Content toolbar (Open configuration file + close): grouped flush to
     the right edge, and reparented INTO the nav row on mobile so it shares
     one line with the tabs (user feedback 2026-08-16 — the toolbar's own
     row left a full-width dead gap under the tabs). Anchored by class: the
     header leaves the content subtree, so :first-child/:last-child anchors
     would now hit the options area. Children carry official auto-margins
     that would defeat flex-end, so neutralize them. The close button gets
     a round tappable base so it reads as its own control, not part of the
     outline button. */
  [aria-modal="true"]:has(> :first-child > :last-child > button):not(:has([role="navigation"])):not(:has([class*="ZuhsRW"])) [class*="_header"]:not([class*="_headerActions"]) {
    flex: 0 0 auto;
    justify-content: flex-end;
    align-items: center;
    gap: 8px;
    padding: 0 0 0 4px;
    min-height: 40px;
  }
  [aria-modal="true"]:has(> :first-child > :last-child > button):not(:has([role="navigation"])):not(:has([class*="ZuhsRW"])) [class*="_header"]:not([class*="_headerActions"]) > * {
    margin-left: 0 !important;
    margin-right: 0 !important;
  }
  [aria-modal="true"]:has(> :first-child > :last-child > button):not(:has([role="navigation"])):not(:has([class*="ZuhsRW"])) [class*="_header"]:not([class*="_headerActions"]) > :last-child {
    flex: none !important;
    width: 32px;
    height: 32px;
    min-width: 32px !important;
    border-radius: 50% !important;
    display: inline-flex !important;
    align-items: center;
    justify-content: center;
    background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .06)) !important;
  }
  /* Appearance mode cards: the official cube row renders three tall
     vertical cards (~268px) that eat half the sheet. Turn them into a
     compact horizontal trio (icon + label inline, equal widths).
     Relies on the official cube-row class name of this version. */
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
  /* Content: the options area must scroll on its own, independent of the
     sheet (which is overflow:hidden and only caps its height). The content
     wrapper is the flex-1 slot; making IT the scroll container lets the
     options area grow beyond it and scroll instead of being clipped against
     the sheet's rounded corner. Bottom breathing room + safe-area inset live
     here so the last row never sits flush on the edge. */
  [aria-modal="true"]:has(> :first-child > :last-child > button):not(:has([role="navigation"])):not(:has([class*="ZuhsRW"])) > :last-child {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto !important;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    padding: 0 12px calc(24px + env(safe-area-inset-bottom, 0px));
  }
  /* The options area (native overflow-y:auto) is now a child of the content
     scroll container; drop its native auto scroll (and the padding, which is
     owned by the content container now) so there is a single scrollbar. */
  [aria-modal="true"]:has(> :first-child > :last-child > button):not(:has([role="navigation"])):not(:has([class*="ZuhsRW"])) > :last-child > :last-child {
    overflow: visible !important;
    padding: 0;
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

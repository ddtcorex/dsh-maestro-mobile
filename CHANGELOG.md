# Changelog

All notable changes to this project are documented in this file. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.1] - 2026-09-24

### Removed

- **Dead modules, and the composer marker got one home** — a reachability +
  reference scan over `src/` (every module reachable from the two entries, every
  export referenced somewhere, `tsc --noUnusedLocals --noUnusedParameters` clean
  on both faces) left four things to delete:
  `components/BottomSheet.tsx` and its `styles/sheet.css.ts` section — the
  component had no importer and its `[data-mobile-sheet]` rules therefore styled
  nothing; the walker that builds the client bundle never inlined it, so only the
  stylesheet section was being shipped. `effects/overlay-backdrop-fab.ts` — the
  legacy manual `frame.appendChild` backdrop/FAB task: nothing installed it, and
  because its `fadeHook` was the only thing that ever set it, the swipe-close
  call `fadeOverlayOut()` had been a silent no-op. `isGestureConsumed` — a
  `gesture-guard.ts` export referenced nowhere, not even by its own tests. The
  `[data-composer-input]` literal now lives once, in `core/composer-dom.ts`,
  together with the `editorElement()` copy both composer effects carried and the
  visual-viewport reader; five modules used to spell the marker out.
  `probe:composer-plus` 17/17, `probe:pointer-gating` 6/6 and
  `probe:multi-width` 33/33 after the deletions, `pnpm test` 223/223.

### Fixed

- **The drawer's dimming layer fades with the slide-out again** — the swipe
  layer's close commit called a fade that had been a silent no-op since the
  `shell.overlay` slot took over the backdrop (its hook's only setter lived in
  the legacy overlay task nothing installed), so the dimming snapped away ~280ms
  after the drawer had already left: the host flips `data-sidebar-collapsed` when
  the animation lands, and React unmounts the layer at that moment. The new
  `effects/backdrop-fade.ts` resolves the layer itself and drives the same two
  inline properties the retired task did — `opacity` and `pointer-events`, both
  `!important` so React's style prop and the layer's entry animation cannot
  outrank them — with the rect flushed between the transition and the target so
  the fade provably starts at opacity 1. Resolving the element instead of taking
  a registered hook is deliberate: that seam is what went stale, and a function
  that finds its own element cannot. No restore is needed, because the layer is
  conditionally rendered per open. Gate: `pnpm probe:backdrop-fade` (4 rows: the
  layer opens opaque, goes mid-fade while the drawer slides — 12 partial frames
  and a final opacity of 0 — lands gone with the drawer closed, and a
  non-animated backdrop tap still closes cleanly). A/B: with the fade call
  disabled the mid-fade row FAILs with the layer at opacity 1 for the whole
  755ms window, which is the reported symptom.
- **The composer "+" stops raising the keyboard on the host's second focus** —
  reported after the release above landed: tapping `+` with the keyboard dismissed
  still brought it up. The focus shadow was lifting too early — the host focuses
  the editor again from the effect that runs when its menu opens, which is after
  this plugin's bubble handler has read the menu as "not open" (mounted, not yet
  laid out). `FOCUS_SHADOW_MIN_MS` (700ms, still bounded by the 1.5s cap) makes
  the window a floor rather than a click-scoped one, and a `focusin` capture-phase
  blur takes back any focus that reaches the editor during the window, because a
  blur in a macrotask is too late (the IME has started). Both come from the
  community plugin `mexiaosqwq/dsh-web-mobile`'s `composer-keyboard-guard.ts`,
  which measured the timing on a real iPhone; their v3.0.2 does not touch this
  path. `probe:composer-plus` gates the window (`shadow-window-outlives-the-click`,
  `shadow-lifts-on-its-own`), and the take-back rule is unit-tested
  (`shouldTakeBackArmedFocus`) because this host leaves the editor unfocusable
  while its menu is open, so a focus-driving probe row would pass either way.
  Refs: mexiaosqwq/dsh-web-mobile v3.0.0/v3.0.1.
- **The composer no longer drops the keyboard while it is being typed in** —
  reported from the phone as "the keyboard hides by itself" after the fix above
  landed. The release trusts the keyboard reading, and that reading was the
  classic `innerHeight - visualViewport.height` inset: on a page that cannot
  scroll (this shell is a full-height flex layout), iOS shrinks the LAYOUT
  viewport with the keyboard too, so both heights move together and the inset
  stays near zero while the keyboard is up. The reading now also compares against
  the tallest `visualViewport.height` seen recently (resetting on rotation) and
  treats either signal saying "up" as up, and a keystroke in the editor
  (`beforeinput` / `input` / `keydown` / `compositionupdate`) keeps the release
  away for 1.5s whatever the viewport says. `probe:composer-plus` gained
  `focus-release-holds-when-both-heights-shrink` (emulating the iOS case: both
  heights shrink by the same amount), A/B-validated against the inset-only
  reading, where it FAILs with the editor losing focus and the release count
  rising while the emulated keyboard is up.
- **The iOS keyboard stops coming back on the first tap of the composer "+"** —
  reported from the phone after the focus shadow landed. The shadow neutralises a
  `focus()` the host calls, and the tap that raises the keyboard focuses nothing
  at all: iOS keeps the composer's contenteditable as the active element once
  the keyboard goes away, and WebKit shows the keyboard for that retained
  editable on the next tap. The plugin now releases the focus while the keyboard
  is hidden — at install, on a 500ms heartbeat, on an editor `focusin`, on a tap,
  on `visualViewport` resize/scroll, and as soon as the "+" shadow lifts — and
  never during the tap (the uncompensated blur that bounced the composer row),
  never while the keyboard is up, never inside the 700ms grace after a finger
  lands on the editor, and never while the visual viewport is unreadable (a
  pinch-zoomed viewport reads as "no keyboard"). The blur's own viewport nudge is
  undone by restoring the scroll on the next frame when it moved by
  `NUDGE_MAX_PX` or less. The invariant is a state, not an event: measured, a
  focus can land on the editor with no `focusin` dispatched at all, which is what
  the heartbeat is for. `probe:composer-plus` runs the battery under an iPhone
  user agent (the release arms on `detectIosWebKit`) and gained three rows for
  it — precondition, release armed, and the release resuming after an editor tap
  — A/B-validated against the release inverted to never install for iOS, where
  they report the retained focus, `releases=null`, and the retained focus
  surviving a "+" tap.
- **The composer probe no longer inherits the typing scene's fake viewport** —
  the scene replaces `window.visualViewport` to emulate a keyboard and only put
  back an own descriptor, which Chrome does not have (the property lives on the
  prototype): the stub outlived the scene, every later row read "keyboard up",
  and the focus rows were silently disarmed. It now deletes the stub when there
  is nothing to restore, and a `composer.focus-release-precondition` row reports
  the keyboard inset it is asserting against. A probe throw also lands as a
  `probe.crashed` FAIL row with a `SUMMARY` instead of a stack, and the
  touch taps use the camelCase `touchEnd` CDP event type (`touchend` is rejected
  with `-32602`, which killed the run mid-battery).

## [1.6.0] - 2026-09-23

### Added

- **Sidebar panels have a way back to the conversation** — a global panel
  (Plugins, Skills, …) replaces the main column and the host ships no exit:
  `PanelRow`'s onClick is a bare `selectPanel(id)`, so re-tapping the selected
  row re-selects it, and a panel page renders no session header — which is
  where the drawer toggle lives. One shared `exit()` now serves three routes:
  the system back key (one history entry armed while a panel owns the main
  column, given back when the panel leaves by another route so it cannot
  swallow the user's next back press), a re-tap of the already-selected panel
  row (`[class*="panelRow"][aria-current="page"]`), and the shell FAB, which
  reads as "back to conversation" there and moves to the top-left corner
  (`data-mobile-nav-fab-mode="exit-panel"`) instead of the hero seat that used
  to float over the panel's own head. The host's panel-selection face is
  capability-probed, so a host generation without `selectPanel` leaves every
  route inert instead of throwing. Refs: mexiaosqwq/dsh-web-mobile v3.0.0/v3.0.1.
- **`pnpm probe:composer-plus`, `pnpm probe:panel-exit` and
  `pnpm probe:multi-width`** — three live gates for the phone interactions
  above: the composer menu across four taps (open/close/open/close), the panel
  FAB back face plus back-key and re-tap exits and their history bookkeeping,
  and the layout tiers (phone 320/360/390/430, tablet 768/1023, desktop 1280)
  including the header icon actually painting an `svg path`. All three were
  A/B-validated against the pre-fix behaviour so they fail on a build that
  lacks the fix. `pnpm test` gains `tests/phone-tier-gating.test.ts`, which
  locks the tier structure (a `min-width: 768px` block must also cap 1023 and
  require a coarse pointer; the tablet overrides must come after the mobile
  gate).

### Fixed

- **A second tap on the composer "+" closes the command menu** — the button's
  `onClick` focuses the editor before toggling the launcher, and that focus
  re-enters `controller.track()`, whose first act is `clearLauncher()`; the
  host's "already open ⇒ dismiss" branch then compares against a null launcher
  and is unreachable, so every tap re-opened the menu (the host's own
  `aria-expanded` stays `false` while it is visibly open). The plugin now
  remembers the menu's state in the click capture phase and, in the bubble
  phase after React's handler, closes it through the host's own Escape path
  when it is still open. The opening tap is never touched.
- **Tapping "+" releases the editor focus while the menu is open** — the
  command menu needs no soft keyboard, but that same focus call re-raises the
  IME on Android and slides the composer row up under the user's second tap
  (measured upstream: visual viewport 754 → 471 about 170ms after the tap, with
  no DOM event reaching the page). A tap on "+" now drops the focus before the
  click fires and repeats the release at 120/320/640ms while the menu is on
  screen, cancelled the moment the user touches the editor.
- **The two probe reds are gone** — `probe:panel-font` now opens a session
  through the drawer (the injected `dsh.sessions.current` is only a hint on this
  host) and waits for the conversation history to render before measuring the
  content font axis: it used to sample while the flow still showed
  `Loading history...`, so the axis row was red against a placeholder. The axis is
  live on 0.1.7-alpha.2 (`15px -> 22px`, floor held). `smoke:cdp` no longer seeds
  `localStorage['dsh.sessions.current']` with the requested session: the restored
  selection and the probe's own navigation opened the same session twice, the app
  released the first reference while the right sidebar awaited it, and the host
  logged `Sidebar Session opening failed: ... is released` — a page error from the
  probe's boot, not the plugin (with an unrestorable id the same drive logs zero).
  The scenario opens a session through the drawer instead, which also exercises
  the real header toggle. Result: `probe:panel-font` 12/12 and `smoke:cdp`
  17 pass / 1 state-skip / 0 fail with `page.errors count=0`.
- **Tapping "+" no longer raises the keyboard on iOS** — the Android half of
  this (blur the editor after the tap) is not enough there: iOS follows DOM
  focus, so once the host's `focusDraftEditor` inside the button's `onClick` has
  run the keyboard is up and a later `blur()` does not take it back (reported on
  iOS after the first fix landed). The editor's programmatic `focus` is now
  neutralised for the length of the interaction (armed on pointerdown and again
  in the click capture phase, which is what covers a click with no pointerdown
  at all), and it is always given back — on the next tap anywhere, as soon as the
  menu leaves the DOM, on a hard 1.5s cap, and on dispose — because an override
  that outlives the interaction is worse than the bug it prevents: the editor
  could never be focused again (the exact bug the community plugin fixed in
  v3.0.1). The blur the Android fix introduced is now conditional — it runs only
  while the keyboard is already hidden (`shouldDropEditorFocus`, read from the
  visual viewport). Blurring an editor whose keyboard is UP starts the hide
  animation, and the keyboard is the composer's floor, so the row slid down under
  the finger on the FIRST tap only (reported from the iPhone after the first iOS
  fix); blurring one whose keyboard is already down is the state the IME re-rises
  from, and there the blur is what keeps the row still. `probe:composer-plus` now
  gates all of it, including a typing-state scene (emulated keyboard) where the
  focus must survive the tap. A second phone report pinned the blur itself as the
  remaining movement: the composer bounced up and back within 10-20ms, which no
  keyboard can do (iOS takes ~250ms to show or hide one) but a programmatic blur
  on iOS can, because it nudges the visual viewport. iOS therefore never blurs —
  the focus shadow is the whole defence there — while Android keeps the blur,
  which is what stops the IME re-rising into a hidden-keyboard editor. The shadow
  is also armed on `touchstart` now (idempotent), because iOS can fire the touch
  before the pointer event.
- **Host icons are resolved by name at runtime** — the host's icon exports are
  generation-specific (`IconXxxOutline16` on the 0.1.0-rc line versus
  `IconXxxOutlineRegular` / `…Medium` on 0.1.7) and the two generations share no
  names, so a static import resolves to `undefined` on the other one and React
  reports "Element type is invalid" for the whole plugin tree. The first
  candidate name the installed host actually exports now wins, and a name
  nothing matches renders nothing rather than crashing.
- **The plugin stylesheet replaces its previous copy** — a plugin re-applied in
  the same JS environment (client hot reload, or a second apply whose dispose
  never ran) stacked a second `<style>` tag with the same rules, and the older
  tag could win on source order inside the cascade: the symptom was "I changed
  the CSS and nothing moved" while the served bundle was correct. The mount now
  removes any tag carrying the plugin's `data-plugin` marker first, keeps the
  fresh tag last in `<head>` for its `!important` overrides, and never
  resurrects a disposed tag from the deferred re-append.

## [1.5.0] - 2026-09-22

### Fixed

- **The hero header corner keeps the right gutter** — on a blank (hero)
  session `hideChrome` removes the title cluster, so the corner seat became
  the title row's `:first-child` and the structural cluster rules restyled
  it: `width: 100%` stretched the absolutely-positioned corner across the
  row and parked the "Open right sidebar" button at the row start (x=50)
  instead of the right gutter. The cluster selectors now exclude the corner
  and the corner shrink-wraps its own 28px button (#49).
- **The session title clears the drawer toggle by one rhythm** — row padding
  (16) plus cluster padding (20) left a 16px hole between the toggle's edge
  and the title, twice the header's 8px rhythm; 12px lands the title just
  past the toggle (#49).
- **The header's Open-in-Files group is gone on mobile** — the
  `ui-open-in-app` split button deep-links into a desktop app, is useless on
  a phone and ate ~50px of session-title room; the whole group hides at
  every mobile width instead of only its chevron below 480px (#49).
- **Trailing header buttons dock one rhythm from the corner toggle** — with
  the utilities cluster emptied, the shrink-only title cluster stranded its
  trailing controls mid-row, 44px from the corner at 402px. The cluster now
  grows to fill the row and the emptied utilities box leaves it outright
  (#49).
- **The drawer button no longer floats over an open panel** — a global panel (Plugins, …) replaces the conversation, so it carries no `[data-phase]` element either. The shell defined `heroPhase` as "no active phase" and mounted the floating drawer button on it, so on a panel page the button rendered at `10,72` with `z-index: 21` and `pointer-events: auto` — covering the panel's own subtitle and swallowing taps aimed at the panel. The overlay now asks a positive question instead (`src/client/effects/panel-presence.ts`): a panel is open when the host marks a panel page (`[data-plugin-panel]`) or a sidebar panel row reports `aria-current="page"`. Keying on the presence of a panel rather than the absence of a conversation is the point — absence is what made the original inference wrong.
- **The drawer no longer stays open over a sidebar panel** — tapping a global-panel row (Plugins, Skills, …) swapped the main column but left the drawer open on top of the panel it had just opened. The host exposes `layout.selectPanel(null)` on the service but no UI affordance ever calls it, so the drawer was the only element with a way out. The drawer tap whitelist now carries the `panelRow` fragment alongside session rows, search results, task board and ssh entries; the selector moved into an exported fragment list so the decision table is unit-testable without a DOM, and it stays narrow on purpose — a tap that opens a menu or mutates in place must still leave the drawer mounted.
- **Message text follows the host content font-size setting** — message prose was pinned at `15px !important`, which made the host typography setting a dead control on every touch device. The host publishes the user's choice as `--dsh-content-font-size` on `<body>` (ui-layout `ThemePresenter.apply`) and derives its own `--dsw-font-markdown-base` from it; the plugin now reads that axis via `max(15px, var(--dsh-content-font-size, 14px))`. The default setting is 14px, so phones render exactly as before, a larger setting now reaches the text, and the 15px floor stays independent of the iOS focus-zoom guarantee the composer field owns. Control geometry (buttons, chips, sheet titles) keeps its fixed sizes — the axis governs prose, not chrome.
- **The iOS 16px field floor holds at every viewport** rather than only on the widths the original rule covered (#41).
- **The session title wins the header row over the lineage badge** — a pinned max-content lineage trigger crushed the switcher to 16px on narrow phones; the separator hides and the trigger ellipsizes while the count stays visible (#43).
- **Overlay option-list taps select on touch devices** (#45).
- **The Files glyph is optically centered in its button** — the arrow ink masses toward the arrowhead and read low-left at phone sizes; a 2px nudge balances it (#48).

### Changed

- **The session header is rebuilt for the DSH 0.1.7 div structure** — 0.1.7 removed the `<header>` element from the session-header seat, so the pre-0.1.7 rules matched nothing and the title/lane geometry collapsed; the block re-anchors on `div.titleRow` and `div.tabs` and the old selectors stay for ≤0.1.6 (#47).
- **DSH 0.1.6-alpha.2 client contracts are supported** (#42).
- **The upstream contract scan understands CSS variables** — `docs/upstream/compat-contracts.json` gains a third contract kind, `variable`, which asserts a custom property resolves to a non-empty value on `<body>` (the live check behind the font-size axis, where a grep for the variable would not prove the setting reaches the text). The sidebar panel row is registered as a `hash` contract, and the open-in-app split group as a `fragment`.
- Declare package license, repository and Node engine range in the manifest (#40); correct the `lib/` build-output claim in the docs (#39).

## [1.4.0] - 2026-09-12

### Added

- **Session deletion on touch devices** — the session-row ⋯ menu gains a "Delete session" item with a confirmation-first dialog (Escape cancels, failures are announced, focus starts on Cancel), backed by a new host route `POST /api/mobile-nav.session.delete` that removes the session's own log directory and refuses anything outside the persistence root. A session still live in the host process is refused with `409 session-busy` rather than deleted under a running agent (#35, #37).
- **Upstream contract scan and regression probes** — `docs/upstream/compat-contracts.json` plus `pnpm contracts:cdp` report every marker and class fragment this plugin depends on (HIT / MISS / SKIP), and `pnpm probe:pointer-gating`, `probe:swipe`, `probe:session-delete` cover the risky behaviours on the live page. `docs/maintenance/pitfalls.md` and `docs/upstream/upgrade-runbook.md` record the traps and the post-upgrade checklist (#36).

### Changed

- **The mobile branch is pointer-gated** — rules and effects now require `(max-width: 1023px) and (pointer: coarse)`, with the exact complement for desktop, so a narrow mouse-driven window (or an OS-scaled display) keeps the stock shell instead of mounting the mobile one (#32).
- **Draggable floating widgets can yield the drawer swipe** through the new `data-mobile-nav-dragging` cooperation mark, with a positional fallback for widgets that ship no mark (#34).

### Fixed

- **Pinch zoom** — a second finger abandons the swipe stroke instead of being ignored, so the browser's pinch is never cancelled (#32).
- **Text selection** — a live selection (document selection or a control's own `selectionStart`/`selectionEnd`) owns the stroke instead of being collapsed by the drawer gesture (#32).
- **Viewport meta** — the plugin re-asserts `viewport-fit=cover` across host rewrites and node replacement, so notch insets cannot silently go stale (#32).
- **iOS focus zoom** — the 16px field floor applies on iOS/iPadOS WebKit only, and the viewport meta no longer carries `maximum-scale`, which used to take pinch away from Android (#32).
- **View overlays** — an open `conversation.view` overlay (trajectory tab, file viewer) keeps the left-edge horizontal pan (#32).
- **Response compression** — header lookups and rewrites are case-insensitive, so a mixed-case `Content-Type`/`Content-Length` no longer skips compression or ships a stale length (#32).
- **Tooltips** — suppression is scoped to the conversation phase and pointer-gated, so other plugins' tooltips survive on a phone (#32).
- **Session-delete dialog** — it is hosted on `<body>` above the shell's drawer layer, centred in the viewport, and the destructive action keeps its danger styling instead of losing it to a descendant selector (#37).

### Removed

- The composer's one-tap attachment button; the `+` trigger in the same tool row already opens the file picker (#31).

## [1.3.4] - 2026-09-11

### Added

- **Background-jobs control** — the session header's job trigger collapses from its labelled sentence (179x28px on a 390px phone, which left the session title 30px) to a 28px circle carrying the count as a badge, and its list docks as a full-width panel under the header instead of rendering below the viewport (#29).

### Fixed

- **Ask card with a long question** — the card no longer paints the question outside its own bounds, and the card now scrolls as one block so the choices and Submit stay reachable; the iOS input-focus zoom guard targets the current answer-field classes again (#28).
- **Mobile chrome** — header, composer row and drawer foot card polish, with the right-sidebar toggle reusing the header corner the redundant flow menu vacated (#27).
- **Composer** — `@` trigger menu taps are exempt from the touch mousedown guard that suppresses the soft keyboard (#20).
- **Sidebar** — targets the DSH-native sidebar, and every rule is a complete no-op at 1024px and above (#24).

### Changed

- `lib/` build output is no longer tracked, and `AGENTS.md`/`CLAUDE.md` are back under version control (#21, #22).
- The test suite covers every file under `tests/` (#25).

## [1.3.2] - 2026-09-04

### Fixed

- **Recovered Connected chip** — lift the recovered Connected confirmation like Connecting/Disconnected in the drawer foot (#15). Upstream renders it as div[role=status] with no data-phase, so the #12 rules missed it and it squeezed beside the Settings trigger.

## [1.3.1] - 2026-09-02

### Fixed

- **Hero preset menu cutoff** — prevent hero preset menu top cutoff on long lists (#13).
- **ConnectionIndicator stretch** — keep ConnectionIndicator out of settings trigger stretch (#12).

### Changed

- Release 1.3.0 included: secondary border for drawer actions, remove footArea gap, rebuild client bundle for 0.1.2-alpha.2, CI pin bump.


## [1.2.0] - 2026-08-31

Ported `mexiaosqwq/dsh-web-mobile` `v2.3.0` sidebar gestures + streaming perf; plus ask-question and stats bar mobile fixes.

### Added

- **Sidebar swipe gestures** (`gesture-guard.ts` + `sidebar-swipe.ts`, B-hybrid follow): `45%` viewport start zone, `8px` axis lock, `60ms` velocity window (`0.45 px/ms`), bidirectional `translateX` follow with early commit (open) and `280ms` late commit (close), `touch-action: pan-y` + `overscroll-behavior-x: none` (suppress Chrome edge history nav), horizontal scroller yield, `prefers-reduced-motion` reduce, synthetic click consume guard (`300ms` window + `pointerdown` clear + `isStrokeLocked` yield).
- **Drawer backdrop fade** (`overlay-backdrop-fab.ts`): fade-out `200ms` handoff so dimming eases with drawer slide, quick close→reopen cancels pending removal.
- **Streaming perf**: `stats-line.ts` anchor fast-path `O(1)` when `[data-mobile-nav="stats"]` still alive, drawer `[role="tree"]` `content-visibility: auto` + `contain-intrinsic-size` for off-screen rows.

### Fixed

- **Overlay interactions** (`phone-chrome.ts`): drawer `click`/`pointerup` now yield to `isStrokeLocked()` / `consumeIfGestured()` — fixes double-toggle and backdrop requiring two taps after a swipe.
- **Ask question Submit cutoff** (`composer.css.ts`): `QuestionComposer` footer wrapped (`pager order1`, `footerActions order2 ml-auto`, `feedback order3 flex 1 1 100%`), `frame`/`card` capped to `100%` with `12px` side padding — fixes cutoff on `390px` phones.
- **Composer status bar scroll** (`composer.css.ts`): `[data-mobile-nav="stats"]` now `flex nowrap + overflow-x auto + -webkit-overflow-scrolling touch` with hidden scrollbar and `12px` gap — long `turns/steps/TPS` scroll horizontally.
- **Stats bar padding balance** (`composer.css.ts`): symmetric `4px 12px 6px` padding — left no longer inherits host `24px` title inset.

### Notes

- Verified: `pnpm verify` clean, `pnpm build` `lib/client.js 27 modules`, `tests 6/6`.

## [1.1.1] - 2026-08-30

### Fixed

- **Drawer footer Bento** (`layout.css.ts` + `base.css.ts`): `footArea` card (`bg-layer-2`, `border-l1`, `r14`, `p10`) with `footerActions` column and `settingsArea` primary ghost (`h42`, `border-l2`, `bg-elevated`, shadow) — balances drawer bottom.
- **Stop generating tooltip on mobile** (`composer.css.ts`): `[role="tooltip"] {display:none}` under `max-width:1023px` — tooltip no longer lingers mid-screen after tap on `InputBar` send on touch devices. Kept `dsh-market` menus (`role menu`) unaffected.
- Noted: Lexical `contenteditable` composer shrink left as upstream DSH bug — plugin keeps no-op there per user preference.

### Notes

- Verified: `pnpm verify` clean, `pnpm build` `lib/client.js 25 modules`, `tests 6/6`.

## [1.1.0] - 2026-08-28

Ported improvements from `mexiaosqwq/dsh-web-mobile` `v2.2.0` (commit `4d2f884`) while keeping `dsh-better-sidebar` support.

### Added

- **Host transparent compression** (`src/compress.ts`): `gzip`/`brotli` for JSON ≥4 KB (`br q6`, 17 MB → ~1 MB), ported from `wzxmt-zhc` fork — large session history loads faster on phones.

### Fixed

- **Notch / safe-area scroll** (`layout.css.ts`): `box-sizing: border-box` on frame — prevents document scroll by `inset` height, composer no longer lifts off bottom, messages no longer under composer.
- **Drawer geometry** (`layout.css.ts`): `width: max-content; max-width: 92vw` — removes forced `width: 100%` stretch that crushed `dshmarket` chips; keeps `settingsArea` + Maestro trigger.
- **Drawer close on mobile** (`phone-chrome.ts`): `aria-selected` signature `MutationObserver` + `500 ms` touch guard + `2 s` timeout — fixes iOS synthesized-click race where tapping a session row closed the drawer but never opened the conversation (`#32`). Keeps right-panel (`dsh-better-sidebar`) handling.
- **Composer right cluster** (`layout.css.ts`): `[pill][meter][send]` welded at right edge (`margin-right: -4px`, trigger `24 px`), markdown images capped at `220 px / 40dvh`.
- **Subagent chip flash** (`subagent-chip-touch.ts`): handles both `ZKlsPq` hover and `h8S2Va` click eras, `1 s` `stopPropagation` click-suppress — fixes panel flashing open then shut on `rc.6` (`PR #33`).
- **AionUI preview** (`aionui-compat.ts`): restore-safe `navigator` spoof (single timer, always restores on dispose).
- **Stats line** (`stats-line.ts`): i18n regex now matches `轮|步` (Chinese).

### Notes

- Verified: `pnpm verify` clean, `pnpm build` `lib/client.js 169 KB`, `tests 6/6`.

## [1.0.0] - 2026-08-25

Initial release of `@ddtcorex/dsh-maestro-mobile`, a client-only DeepSeek Harness plugin
that adapts the Web UI for portrait / mobile viewports below 1024px. At ≥1024px it is a
complete no-op so desktop layout is untouched.

### Added

- **Overlay drawer for the sidebar** below 1024px (~80vw, `transform: none` when open)
  with backdrop, FAB toggle, and Escape handling; tablet 768–1023px uses centered,
  width-constrained sheets.
- **Dialogs → bottom sheets** — Settings, explorer, and preview become mobile-friendly
  sheets with `env(safe-area-inset-*)` notch handling and scroll-safe padding.
- **Status-bar & safe-area fixes** — light/dark `theme-color`, `touch-action: manipulation`
  + `gesturestart` guard against double-tap zoom.
- **Composer & toolbar fixes** — permission capsule, model name, and switch menus use
  fixed-size pinning so they never squeeze or overlap on narrow screens.
- **Client reconciler** — `reconciler-core.ts` (DOM-free task registry, dirty-key routing,
  coalesced rAF flushing, per-task isolation) + `phone-chrome.ts` (`MutationObserver` on
  `document.documentElement` driving `installMobileEffect`).
- **Slot integrations** — `conversation.session.header.actions` (`MobileNavToggle`: drawer
  toggle + Files) and `sidebar.footer.action` (`MobileDrawerFooter`: Files + session-log
  actions), with locale dictionaries and a single `<style data-plugin>` tag.
- **Diagnostics** — `?dsh-maestro-mobile-debug=1` (legacy `?mobile-nav-debug=1`) floating
  bar for viewport / frame / floating-panel / JS-error state; optional CDP probe
  `pnpm smoke:cdp` against `127.0.0.1:3080`.

### Notes

- The package is consumed as a DSH plugin via `cordis.patch.yml` (`id: dsh-maestro-mobile`)
  and is installed with `dsh plugin --profile web add @ddtcorex/dsh-maestro-mobile` or
  `link:` for local development. Live `lib/` is committed so a rebuild is only needed
  after editing `src/`.
- Verified with `pnpm verify` + `pnpm test:core` + `pnpm build` (`test -f lib/index.js`);
  phone ~390px / tablet 768–1023px / desktop ≥1024px geometries checked on live DSH Web.

[1.2.0]: https://github.com/ddtcorex/dsh-maestro-mobile/releases/tag/v1.2.0
[1.1.1]: https://github.com/ddtcorex/dsh-maestro-mobile/releases/tag/v1.1.1
[1.1.0]: https://github.com/ddtcorex/dsh-maestro-mobile/releases/tag/v1.1.0
[1.0.0]: https://github.com/ddtcorex/dsh-maestro-mobile/releases/tag/v1.0.0

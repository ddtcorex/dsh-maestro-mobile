# Changelog

All notable changes to this project are documented in this file. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

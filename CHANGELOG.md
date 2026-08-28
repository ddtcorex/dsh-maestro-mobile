# Changelog

All notable changes to this project are documented in this file. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.1.0]: https://github.com/ddtcorex/dsh-maestro-mobile/releases/tag/v1.1.0
[1.0.0]: https://github.com/ddtcorex/dsh-maestro-mobile/releases/tag/v1.0.0

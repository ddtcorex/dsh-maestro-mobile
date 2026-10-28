# dsh-maestro-mobile

Mobile adaptation for the DeepSeek Harness (DSH) Web UI. On touch-primary devices below 1024px it turns the sidebar into an overlay drawer, sheets the dialogs, and tunes the composer for phones; any mouse-driven window, at every width, is a complete no-op — a narrow desktop window or a scaled display never gets the mobile shell.

## What you get

| Capability | How it works |
|---|---|
| Sidebar → drawer | On touch-primary devices below 1024px the sidebar becomes a left overlay drawer (~80vw, `transform:none` when open); desktop is untouched at every width |
| Dialogs → sheets | Settings, explorer, and preview become mobile-friendly bottom sheets with `env(safe-area-inset-*)` handling and notch avoidance |
| Status-bar & safe areas | Status-bar / notch padding, light/dark `theme-color`, and `touch-action: manipulation` + `gesturestart` guard against double-tap zoom |
| Composer stays clean | Permission capsule, model name, and switch menus use fixed-size pinning so they never squeeze or overlap on narrow screens |
| Tablet friendly | 768–1023px centered, width-constrained sheets; phone and tablet geometries are verified separately |
| Easy diagnostics | Append `?dsh-maestro-mobile-debug=1` for a floating bar with viewport / frame / floating-panel / JS-error state |

## Requirements

- Node.js ≥ 22, pnpm ≥ 11
- A running [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) `web` profile (`pnpm dsh web`), DSH `0.2.x` (verified on `0.2.2-alpha.2`)
- Chromium 105+ for the `:has()` selectors

Response compression is the host's job when it is enabled: with `webServer`
configured `compression: gzip` (the deployed profile does this) the plugin leaves
the responses alone, because DSH's own middleware already serves brotli/gzip and
wins the `writeHead` race. On a profile that keeps the host default
(`compression: none`) the plugin installs its own transparent gzip/brotli patch.

## Install

```sh
# from the registry
dsh plugin --profile web add @ddtcorex/dsh-maestro-mobile

# local development (live link: edit + rebuild just works)
dsh plugin --profile web add link:/path/to/dsh-maestro-mobile
```

`lib/` is gitignored build output: `pnpm build` produces it locally, and `pnpm-workspace.yaml` carries the `allowBuilds.esbuild` entry a fresh install needs. Restart `dsh web` after installing or after any `pnpm build`.

### Manual `cordis.yml` row

If you are not using `dsh plugin`, add this row to your `cordis.yml`:

```yaml
- id: maestro-mobile
  name: '@ddtcorex/dsh-maestro-mobile'
```

## Development

```sh
pnpm install        # install (pnpm@11.7.0, lockfile v9)
pnpm verify         # type-check host + client (tsc --noEmit)
pnpm test           # node --test tests/*.test.ts (full suite)
pnpm test:core      # node --test tests/reconciler-core.test.ts tests/composer-keyboard-touch.test.ts (fast subset)
pnpm build          # tsc host + client && node scripts/build-client.mjs -> lib/
```

`pnpm build` is the required gate after any source change; `lib/` is gitignored build output, so a change is incomplete until the build refreshes it locally.

Optional CDP regression probe (requires a live DSH Web on `:3080`, PIN cookie; to probe the raw server instead, set `DSH_PROBE_URL=http://127.0.0.1:3082/?token=<launch-token>` as in `docs/upstream/upgrade-runbook.md` §2):

```sh
DSH_PROBE_SESSION_ID=<id> pnpm smoke:cdp
```

## Architecture

- Host / client split is load-bearing: `src/index.ts` owns the session-delete route (`POST /api/mobile-nav.session.delete`) plus the conditional response-compression patch; all browser behavior lives in `src/client/`.
- The delete route authenticates through the host (`connection.requestRejection`) because the `/api` launch-token fence is a prefix route that an exact route shadows; it fails closed with `503 admission-unavailable` when the host publishes no connection service.
- `src/client/index.tsx` injects `['slots','layout','locale','sessionLogDownload','sessions','workspaces']`, registers locale dictionaries, injects one `<style data-plugin>` tag, and registers three slots (`MobileNavToggle` in the session header, `MobileDrawerFooter` in the sidebar foot, `ShellOverlay` backdrop + FAB).
- Shared full-tree reconciler: `src/client/core/reconciler-core.ts` (zero-import engine) + `phone-chrome.ts` (a single `MutationObserver` driving `installMobileEffect`).
- Styles are concatenated `tokens → base → layout → sheet → explorer-sheet → composer → settings-sheet → misc` into one tag; mobile rules target `(max-width: 1023px) and (pointer: coarse)`.

## License

[MIT](LICENSE)

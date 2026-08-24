# dsh-maestro-mobile

Mobile adaptation for the DeepSeek Harness (DSH) Web UI. Below 1024px it turns the sidebar into an overlay drawer, sheets the dialogs, and tunes the composer for phones; at ≥1024px it is a complete no-op, so desktop is untouched.

## What you get

| Capability | How it works |
|---|---|
| Sidebar → drawer | Below 1024px the sidebar becomes a left overlay drawer (~80vw, `transform:none` when open); desktop ≥1024px is untouched |
| Dialogs → sheets | Settings, explorer, and preview become mobile-friendly bottom sheets with `env(safe-area-inset-*)` handling and notch avoidance |
| Status-bar & safe areas | Status-bar / notch padding, light/dark `theme-color`, and `touch-action: manipulation` + `gesturestart` guard against double-tap zoom |
| Composer stays clean | Permission capsule, model name, and switch menus use fixed-size pinning so they never squeeze or overlap on narrow screens |
| Tablet friendly | 768–1023px centered, width-constrained sheets; phone and tablet geometries are verified separately |
| Easy diagnostics | Append `?dsh-maestro-mobile-debug=1` (legacy `?mobile-nav-debug=1`) for a floating bar with viewport / frame / floating-panel / JS-error state |

## Requirements

- Node.js ≥ 22, pnpm ≥ 11
- A running [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) `web` profile (`pnpm dsh web`)
- Chromium 105+ for the `:has()` selectors

## Install

```sh
# from the registry
dsh plugin --profile web add @ddtcorex/dsh-maestro-mobile

# local development (live link: edit + rebuild just works)
dsh plugin --profile web add link:/path/to/dsh-maestro-mobile
```

The repo ships committed `lib/` build output, so there is no `allowBuilds` block. Restart `dsh web` after installing or after any `pnpm build`.

### Manual `cordis.yml` row

If you are not using `dsh plugin`, add this row to your `cordis.yml`:

```yaml
- id: dsh-maestro-mobile
  name: '@ddtcorex/dsh-maestro-mobile'
```

## Development

```sh
pnpm install        # install (pnpm@11.7.0, lockfile v9)
pnpm verify         # type-check host + client (tsc --noEmit)
pnpm test:core      # node --test tests/reconciler-core.test.ts
pnpm build          # tsc host + client && node scripts/build-client.mjs -> lib/
```

`pnpm build` is the required gate after any source change; `lib/` is committed, so a change is incomplete until the build refreshes it.

Optional CDP regression probe (requires a live DSH Web on `:3080`):

```sh
DSH_PROBE_SESSION_ID=<id> pnpm smoke:cdp
```

## Architecture

- Host / client split is load-bearing: `src/index.ts` is the intentionally empty host `apply()`; all browser behavior lives in `src/client/`.
- `src/client/index.tsx` injects `['slots','layout','locale','sessionLogDownload']`, registers locale dictionaries, injects one `<style data-plugin>` tag, and registers two slots (`MobileNavToggle` and `MobileDrawerFooter`).
- Shared full-tree reconciler: `reconciler-core.ts` (zero-import engine) + `phone-chrome.ts` (a single `MutationObserver` driving `installMobileEffect`).
- Styles are concatenated `base → layout → compat → misc` into one tag; mobile rules target `(max-width: 1023px)`.

## License

[MIT](LICENSE)

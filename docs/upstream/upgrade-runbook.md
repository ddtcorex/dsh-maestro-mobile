# Maintenance — host upgrade runbook

Use this after every DeepSeek Harness upgrade (or any change to the client UI
packages this plugin adapts). The plugin reimplements no upstream logic; it
depends on DOM markers and hashed class fragments, so an upgrade can break it
silently — the checks below are ordered cheapest first.

## 0. What this plugin depends on

- Stable markers: `[data-shell-overlay]`, `[data-composer-card]`,
  `[data-composer-input]`, `[data-composer-seat]`, `[data-phase]`,
  `[data-question-key]`, `[data-trigger-menu]`,
  `[data-conversation-composer-overlay]`, `[data-ds-dark-theme]`.
- Hashed class fragments (substring match only): `_composerStack`, `_modes`,
  `_tools`, `_trailing`, `_triggerLabel`, `_actions`, `_bubble`, `_sessionRow`,
  `_title`, `_groupSection`, `_projectRow`, `_itemLabel`, `_itemIcon`,
  `_viewport`, `_panel`, `_navList`, `_navTitle`, `_fieldMirror`, plus the
  market's `irow`, `irowActions`, `irowTrailing`.
- Host services read at runtime: `sessionPersistence`, `sessions`, `agents`,
  `workspaceRegistry`, `webServer`, and (client) `sessions`, `workspaces`.
- The full, machine-readable list is `docs/upstream/compat-contracts.json`.

## 1. Build and unit gates

```sh
pnpm install
pnpm verify
pnpm test
pnpm build
```

If the harness itself was upgraded, rebuild it first — the plugin is `link:`ed,
so it runs against whatever `lib/` the host process loaded:

```sh
pnpm --dir ../../deepseek-harness install
pnpm --dir ../../deepseek-harness build:lib
pnpm --filter @deepseek-ai/dsh-web-frontend run build   # only if the shell changed
```

## 2. Contract scan (catches drift before it becomes a bug)

```sh
DSH_PROBE_SESSION_ID=<a real session id> \
DSH_PROBE_URL=http://127.0.0.1:3082/?token=<launch token> \
DSH_PROBE_CHROME=/opt/google/chrome/chrome \
pnpm contracts:cdp
```

- `MISS` on a non-lazy entry fails the run: that marker/class is gone and the
  rule named in its `note` must be fixed.
- `SKIP` entries are state-gated. The drawer / row-menu anchors of the delete
  flow are exercised properly by `pnpm probe:session-delete`; the rest list the
  manual state that reveals them (open Settings, type `@`, run a background job,
  …). Reveal the ones you care about and re-run.

## 3. Behaviour probes (real browser, real page)

```sh
pnpm smoke:cdp            # drawer / backdrop / FAB / breakpoints / pointer gate / page errors
pnpm probe:pointer-gating # narrow touch = mobile, narrow mouse = no-op, re-arm on crossing
pnpm probe:swipe          # swipe control, overlay / selection / drag / pinch yields
pnpm probe:session-delete # item injection, dialog, Escape-cancel, route liveness
```

All four need `DSH_PROBE_URL` (with the current launch token when probing
`:3082`), `DSH_PROBE_SESSION_ID`, and `DSH_PROBE_CHROME`. Add
`DSH_PROBE_WORKSPACE=<title>` when the cold-start picker must select a specific
workspace.

`probe:session-delete` reports `SKIP delete.route-live` when the host half has
not been loaded yet — that route ships from `src/index.ts`, so it needs a
`dsh web` restart (use the `dsh_web_restart` tool, never a manual kill).

## 4. Host-side deletion flow

The delete route is destructive; validate it in this order:

1. **Guard** (no data touched) — an unknown id must answer `404 {"error":{"code":"session-not-found"}}`, a `GET` or a cross-site `Origin` must answer `403`, a malformed body `400`:

   ```sh
   curl -s -X POST -H 'Content-Type: application/json' \
     -d '{"sessionId":"probe-does-not-exist"}' \
     http://127.0.0.1:3082/api/mobile-nav.session.delete
   ```

2. **A real deletion, only with a session you have chosen to lose.** The probe
   will not pick a victim:

   ```sh
   DSH_PROBE_DELETE_SESSION_ID=<a disposable session id> pnpm probe:session-delete
   ```

   On DSH 0.1.5-rc.2 a *live* session (one the process still holds) answers
   `409 session-busy` by design: only sessions restored from disk and not opened
   in this process are deletable. Confirm the directory under the persistence
   root is gone afterwards.

3. **Deployment check** — the route must stay behind the Maestro PIN proxy on
   `:3080`/`:3081` and the loopback bind on `:3082`; no path may be exempted
   from the PIN gate for it. Re-read the guard in `src/delete-route.ts` if the
   proxy's auth model changes.

## 5. Manual pass (the parts a probe cannot see)

- **iOS Safari**: focus a settings input, the market search box, and the
  composer — the page must not zoom; pinch in and out must work; with the
  keyboard dismissed, tapping Send / Stop / `+` must not re-raise it.
- **Notched phone**: safe-area insets still applied after a host rewrite of the
  `viewport` meta.
- **Desktop**: a narrow mouse-driven window (≈900px) is a complete no-op.
- **Tablet (768–1023px)**: sheets centered and width-constrained.

## 6. Closeout

Bump the peer ranges if the upgrade moved them, commit `lib/`-independent
sources, and record what the scan and probes reported in the PR. Never tag or
publish without explicit human approval.

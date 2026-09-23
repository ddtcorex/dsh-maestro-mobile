# Maintenance — host upgrade runbook

Use this after every DeepSeek Harness upgrade (or any change to the client UI
packages this plugin adapts). The plugin reimplements no upstream logic; it
depends on DOM markers and hashed class fragments, so an upgrade can break it
silently — the checks below are ordered cheapest first.

## 0. What this plugin depends on

- Stable markers: `[data-shell-overlay]`, `[data-composer-card]`,
  `[data-composer-input]`, `[data-composer-seat]`, `[data-phase]`,
  `[data-question-key]`, `[data-trigger-menu]`,
  `[data-conversation-composer-overlay]`, `[data-ds-dark-theme]`,
  plus integration markers (all lazy, see the states in
  `compat-contracts.json`): `[data-gitgraph-chip]` (git-repo session),
  `[data-jobs-count]` (background job running),
  `[data-aionui-explorer-col]` / `[data-aionui-preview-col]` (aionui suite).
- Hashed class fragments (substring match only): `_composerStack`, `_modes`,
  `_tools`, `_trailing`, `_triggerLabel`, `_actions`, `_bubble`, `_sessionRow`,
  `_title`, `_groupSection`, `_projectRow`, `_itemLabel`, `_itemIcon`,
  `_viewport`, `_panel`, `_navList`, `_navTitle`, `_fieldMirror`, `_menu`, plus
  the market's `irow`, `irowActions`, `irowTrailing`, and the chips'
  `_trigger` / `_count` / `_triggerDot`. Never a fragment that *carries* the
  build hash (`ZKlsPq_menu`): that dies on the next rebuild, silently — scope
  with a marker this plugin sets (`data-lineage-root`) or a role upstream draws
  unconditionally (`role="tree"`), and let `tests/no-hashed-class-prefix.test.ts`
  fail the build if one creeps back in.
- Band residents a chip identity rule must exclude: the subagent catalog
  (`aria-haspopup="tree"`, order -30), the Team action
  (`aria-haspopup="dialog"`, order -20), the schedule catalog (order 10, leads
  with a clock icon so its count badge is not its first child) and the mode
  label (not a button). The order is what makes "the first accordion" wrong; the
  roles and the leading badge are what an identity rule can rely on.
- The lineage chip's own scope: its box marker `data-lineage-root` (set by
  `lineage-badge.ts`) plus its catalog, which upstream portals to
  `document.body` — `[class*="_menu"] > [role="tree"]`. Both are read by the
  touch shim's synthetic-hover swallow.
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
- A `HIT` only says the needle exists in the rendered markup (for a class
  fragment, in some element's `class` list) — never that a rule owns it or that
  anything painted. Read the scan as a rename detector and assert "it renders"
  with a real browser probe (see §3).
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
pnpm probe:jobs-chip      # jobs marker identity, 28px chip, one gap across the header band
pnpm probe:lineage-chip   # lineage chip box marker, catalog scope, hover swallow, one tap one toggle
pnpm probe:panel-font     # panel row collapses the drawer; prose follows the content font axis
pnpm probe:composer-plus  # composer "+" opens/closes across four taps
pnpm probe:panel-exit     # panel back face, back key, re-tap exit, history bookkeeping
pnpm probe:multi-width    # layout tiers, see below
```

All of them need `DSH_PROBE_URL` (with the current launch token when probing
`:3082`), `DSH_PROBE_SESSION_ID`, and `DSH_PROBE_CHROME`. Add
`DSH_PROBE_WORKSPACE=<title>` when the cold-start picker must select a specific
workspace. `probe:jobs-chip` and `probe:lineage-chip` are the exceptions: they
take no session id (the DOM exposes none) and read whichever session the drawer
opens, so pass `DSH_PROBE_SESSION_LABEL=<row text>` to measure one that holds a
background job, respectively one with subagents — their chip rows are
state-gated and report `SKIP` without that state.

The multi-width probe must run at all three tiers in one invocation — phones
(320/360/390/430), tablets (768/1023) and desktop (1280, touch off) — because a
value measured on one tier leaking into the next is exactly the regression it
exists to catch. On the phone and tablet scenes it also reads the header toggle's
host icon (a broken icon resolver renders nothing), so the run needs at least one
session row in the drawer; on a host whose sidebar has no session it reports
`no session row in the drawer` instead of passing quietly.

`probe:panel-font` drives a real session itself (the injected
`dsh.sessions.current` is only a hint on this host - it is not restored on its
own) and waits for the history to render before measuring the content font axis:
the conversation shows `Loading history...` until the session log lands, and a
probe that samples once measures the placeholder. With both waits the axis is
verifiably live on 0.1.7-alpha.2 (`15px -> 22px`, floor held at 15px).
`probe:multi-width` and `smoke:cdp` open their session through the drawer for the
same reason, and `smoke:cdp` no longer seeds `localStorage['dsh.sessions.current']`
with the requested session: the restored selection and the probe's own
navigation opened the same session twice, the app released the first session
reference while the right sidebar still awaited it, and the host logged
`Sidebar Session opening failed: ... is released` - a page error caused by the
probe's own boot, not by the plugin (measured: same drive with an unrestorable id
= zero errors).

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

   On DSH 0.1.6-alpha.2 a *live* session (one the process still holds) answers
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
  keyboard dismissed, tapping Send / Stop / `+` must not re-raise it. Then tap
  the editor itself: the keyboard MUST come back (the focus override has to have
  lifted — a shadow that outlives the tap makes the composer unusable).
  `probe:composer-plus` gates the DOM half of this (menu open with the editor
  unfocused at a fixed 900ms sample, and programmatic focus working again after
  the interaction); the keyboard itself is device-only.
- **iOS Safari, the retained focus**: dismiss the keyboard while the composer has
  the caret, then tap `+` — the keyboard must stay down. WebKit shows it for the
  FOCUSED EDITABLE, and nothing is focused by that tap, so the focus shadow
  cannot stop it; `composer-focus-release.ts` releases the editor's focus while
  the keyboard is hidden. Add `?dsh-maestro-mobile-debug=1`, tap `+`, then tap the
  badge and read the trace: `rel=<n>` is the release count (0 or absent on a
  build without the effect) and every event line carries `af=` — a tap whose
  stamp reads `af=div` still had the editable focused, which is the bug. The same
  badge's `vv=` / `seat=` samples are what say whether the release's viewport
  nudge is visible; the compensation is `shouldRestoreScroll`.
- **Notched phone**: safe-area insets still applied after a host rewrite of the
  `viewport` meta.
- **Desktop**: a narrow mouse-driven window (≈900px) is a complete no-op.
- **Tablet (768–1023px)**: sheets centered and width-constrained.

## 6. Closeout

Bump the peer ranges if the upgrade moved them, commit `lib/`-independent
sources, and record what the scan and probes reported in the PR. Never tag or
publish without explicit human approval.

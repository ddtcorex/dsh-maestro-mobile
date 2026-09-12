# dsh-maestro-mobile

Mobile adaptation for the DeepSeek Harness (DSH) Web UI. On touch-primary devices it turns the sidebar into an overlay drawer, sheets the dialogs, tunes the composer for phones, and adds session deletion to the session-row menu; a mouse-driven window, at every width, is a complete no-op.

Names by boundary: npm package = `@ddtcorex/dsh-maestro-mobile`; Cordis patch row id = `dsh-maestro-mobile`.

## Layout

- `src/index.ts` — host half: transparent response compression (`compress.ts`) plus the session-delete route; `src/delete-session.ts` is the harness-free deletion core and `src/delete-route.ts` the request gate.
- `src/client/index.tsx` — browser half. Injects `['slots','layout','locale','sessionLogDownload','sessions','workspaces']`, registers locale dictionaries, injects one `<style data-plugin>` tag, installs effects, and registers two slots:
  - `conversation.session.header.actions` → `MobileNavToggle`: drawer toggle + Files button
  - `sidebar.footer.action` → `MobileDrawerFooter`: Files + session-log actions
- `src/client/effects/` — DOM effects grouped by domain. `reconciler-core.ts` is a DOM-free engine (task registry, dirty-key routing, coalesced rAF flushing, per-task error isolation). `phone-chrome.ts` is the thin browser adapter: one `MutationObserver` on `document.documentElement` maps mutations to dirty keys and drives `installMobileEffect`.
- `src/client/styles/` — CSS as TypeScript string modules. `index.ts` concatenates `tokens → base → layout → sheet → explorer-sheet → composer → settings-sheet → misc` in that order into one `<style>` tag. Mobile rules target `(max-width: 1023px)`; desktop rules hide mobile controls and must preserve the uninstalled layout.
- `lib/` — gitignored build output (host ESM + inlined client bundle + d.ts). Generated; do not hand-edit, never commit.
- `scripts/` — custom client bundler (`build-client.mjs`) and optional CDP smoke probe.
- `tests/` — `node:test` unit tests.

## Development

Run from the repository root:

```sh
pnpm install        # pnpm@11.7.0, lockfile v9
pnpm verify         # type-check host + client (tsc --noEmit)
pnpm test           # node --test tests/*.test.ts  (full suite: unit + CSS contract)
pnpm test:core      # node --test tests/reconciler-core.test.ts tests/composer-keyboard-touch.test.ts
pnpm build          # tsc host + client && node scripts/build-client.mjs  -> lib/
```

`pnpm build` is the required gate after any source change; `lib/` is gitignored, so rebuild locally after pull and before restart — a change is incomplete until the build refreshes it. `pnpm verify` + `pnpm test` are the local checks; `pnpm test:core` is the fast subset.

## Git workflow

- `master` is the default branch; do not commit directly to `master` — use `feat/<topic>` / `fix/<topic>` and a PR against `ddtcorex/dsh-maestro-mobile` (small doc fixes may use same PR flow).
- Conventional commits, imperative mood: `fix(mobile): ...`, `feat(mobile): ...`.
- One logical change = one commit. Never commit while `pnpm verify` is red.
- **Always request approval before merge or release:** never merge a PR/MR or publish a release (`git tag`/`pnpm publish`/`gh release`) without an explicit human `APPROVED` — request review (`gh pr ready` / `gh pr request-review` / ask in chat) and wait for `APPROVED`. Rebase feature branches when the base moves.

## Conventions

- Keep the host/client split intact; the host half owns response compression and the session-delete route, the browser half owns every DOM effect.
- Prefer stable `data-*` markers and structural selectors over hashed classes. For unavoidable hashed classes use substring matching (`[class*=_frag]`), never attribute-suffix (`[class$=…]`); scope to the owning region and guard prefix-overlapping fragments with `:not`.
- Put every long-lived style tag, listener, timer, or `MutationObserver` inside `ctx.effect(() => { ...; return disposer }, label)`. Re-arm query-sensitive effects through `installMobileEffect` (it owns the `matchMedia` + change listener) so wide→narrow and pointer changes work; pass `TOUCH_QUERY` for the features that have no desktop equivalent.
- **The mobile branch is pointer-gated, not width-gated.** `MOBILE_QUERY = '(max-width: 1023px) and (pointer: coarse)'` in `src/client/effects/phone-chrome.ts` is the single source of truth: JS effects and every narrow CSS block must use the identical predicate, and the desktop blocks use its exact complement `(min-width: 1024px), (pointer: fine), (pointer: none)`. A mouse-driven window of any width stays desktop. Headless Chrome reports `(pointer: none)` unless touch emulation is on — probes must call `Emulation.setTouchEmulationEnabled` (see `scripts/cdp-probe.mjs`) and assert the query.
- Treat DOM markers as the cross-module state contract: `data-mobile-nav="frame"`, `data-sidebar-collapsed`, `data-aionui-explorer-open`, `data-aionui-preview-open`, `data-mobile-preview-full`.
- **Draggable widgets yield the drawer swipe through `data-mobile-nav-dragging`.** A component that drags under the pointer must set that attribute while its drag is live — on the element the pointer is holding, on an ancestor, or globally on `body` / `documentElement`; set it in your `pointerdown`/first `pointermove` handler. The gesture layer (`src/client/effects/drag-yield.ts`) reads the mark when a stroke arms and again before the axis locks, and abandons the whole stroke, so a drag can never open the drawer mid-motion. Widgets that ship no mark are caught by a positional fallback (`position: fixed|absolute`, box ≤ 200px, outside our own frame subtree); that heuristic is an approximation — a real widget that misses it should adopt the mark.
- Use idempotent `ensure()` / reparent logic when injecting nodes into React-owned DOM; clean up moved nodes and listeners on disposal.
- Client runtime effects are synchronous DOM work. TypeScript style: single quotes, no semicolons, explicit exported return types, installer names `install<Domain>`.
- Keep CSS in `src/client/styles/`, not in component files. Preserve the `tokens → base → layout → sheet → explorer-sheet → composer → settings-sheet → misc` concatenation order and complete section boundaries.
- Preserve mobile-only behavior and modal precedence: capture-phase drawer handlers must yield to `[aria-modal="true"]` dialogs and ignore session-row action buttons. `transform: none` is required for the open drawer so fixed descendants keep the correct containing block.
- Never edit `lib/` directly; rebuild and include generated artifacts after any source/config change.

## Validation

After source / layout changes, verify in a real browser at both sides of the breakpoint (live DSH Web, not just curl/grep):

- **Phone ~390px** (touch emulation on): rail hidden; drawer / FAB / backdrop open and close; Escape; session-row action menus do not close the drawer; Settings usable; Files opens explorer/preview sheets; session-log/footer actions work; preview fullscreen opens and resets.
- **Narrow desktop window ~900px** (touch emulation off): the plugin is a complete no-op — no frame marker, no toggle/FAB, no stylesheet effect. This is the regression the pointer gate exists for.
- **Tablet 768–1023px**: centered, width-constrained sheet geometry.
- **Desktop ≥1024px**: compare with the plugin disabled — no layout or interaction change.

For phone debugging, add `?dsh-maestro-mobile-debug=1` to show live viewport / frame / floating-panel / JS-error state.

Optional CDP probe: `DSH_PROBE_SESSION_ID=<id> pnpm smoke:cdp` (env `DSH_PROBE_URL`, `DSH_PROBE_CHROME`), against a local DSH Web at `127.0.0.1:3080`.

## Security

The plugin carries no secrets, but it is no longer browser-only: the host half registers `POST /api/mobile-nav.session.delete`, which **destroys a session log**. Treat that route as a destructive surface:

- It inherits the deployment gates (Maestro PIN proxy on `:3080`/`:3081` with an `HttpOnly; SameSite=Lax` cookie; loopback bind + launch-token fence on `:3082`) and adds `delete-route.ts` defence in depth — POST only, reject `Sec-Fetch-Site: cross-site`, require an `Origin` whose host matches the request `Host` when one is present, treat a malformed `Origin` as hostile, and accept exactly one non-empty string `sessionId` in a size-capped JSON body.
- Never widen the flow past confirmation-first: the mutation exists only behind the dialog's confirm button, and the client refuses to guess a row it cannot resolve with certainty.
- Never print, commit, or add fixture values for real tokens or PINs in tests or docs; tests use placeholder paths and derive live paths from `homedir()` / `import.meta.url`.
- Keep the host/client split intact; never modify third-party source packages to add behavior — use scoped DOM markers and CSS overrides.

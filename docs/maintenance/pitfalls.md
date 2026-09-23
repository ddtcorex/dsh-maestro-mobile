# Maintenance — pitfalls

Traps that cost real debugging time in this package. Each entry says what went
wrong, how it presented, and the rule that prevents it.

## Gesture traps

**A body-portalled menu can sit inside the 45% drawer start zone.** The composer model picker is 248px wide with rows at x=84..324 on a 390px phone, so the left third of every row is inside the swipe-in zone. A finger's ordinary horizontal jitter reaches LOCK_PX there: the stroke axis-locks, `armOpenFollow` flips the drawer open, the release classifies to `none`, and the release's consume mark swallows the row's click — the list opens but the row reads as dead. Zero-drift CDP taps never reproduce it; a jitter probe (same point, +12px rightward drift) does. New pointer-owning overlay surfaces must be added to `OVERLAY_MENU_SELECTOR` in `sidebar-swipe.ts`.

**iOS Safari does not focus a tapped button, and the host menus dismiss on blur.** Chrome focuses the tapped row, so the `focusout` carries that row as `relatedTarget` and the card survives; Safari produces `focusout` with `relatedTarget: null`, no following `focusin`, and the host's `onBlur` closes the card before the tap's `click` reaches the row — the list opens, the tap closes it, and nothing is selected. A CDP probe on Chrome therefore passes on broken-for-iOS code. `overlay-menu-tap-guard.ts` stops that one focusout inside a touch tap window; verify with the iOS-shaped sequence (pointerdown inside the menu, then `activeElement.blur()` with no refocus, then the click) and confirm it fails with the guard's listener removed.

## CDP / probe traps

**Headless Chrome has no pointer unless you emulate one.** `Emulation.setDeviceMetricsOverride {mobile: true}` alone reports `(pointer: none)` with `maxTouchPoints: 0`, so a `(pointer: coarse)`-gated mobile branch never arms. Every probe must call `Emulation.setTouchEmulationEnabled {enabled: true, maxTouchPoints: 5}` and assert the query. `maxTouchPoints: 0` is rejected with `-32602` even while disabling, so only send the field when enabling.

**A probe that navigates with `?token=` must compare the origin.** The raw port consumes the launch token and redirects to the bare origin, so a `href.startsWith(url)` page-load gate never matches. Compare `new URL(href).origin`.

**A yield probe must assert its precondition.** The swipe-yield probe passed falsely while the drawer was already open: an edge swipe *closes* an open drawer, which reads exactly like "the yield worked". Assert the drawer is closed before each scenario, and treat a failed reset as a scenario failure.

**The default probe Chrome binary is a snap stub that never launches.** `DSH_PROBE_CHROME` defaults to `chromium`, which on this machine resolves to `/snap/bin/chromium`; the probe then dies in `timeout waiting for chrome target` before it asserts anything. Pass the real binary — `DSH_PROBE_CHROME=/opt/google/chrome/chrome` — when a probe times out on its very first step rather than on a check.

**A probe that would also pass on the old code is not evidence.** Both checks added by `probe:panel-font` were validated by re-implementing the pre-fix behaviour and showing the probe lands somewhere different: at a 22px axis the old `15px!important` resolves to 15px while the new `max(15px, var(…))` resolves to 22px, and the old drawer whitelist matches no `panelRow` class while the new one does. Note the discriminating axis matters — at 14px and 8px both implementations agree, so only the above-floor assertion proves anything.

**Injection happens on the next animation frame.** The session-row menu is a React portal; the plugin appends its item in an rAF after the portal mounts. A probe that snapshots the menu immediately reads `injected=0`. Wait for the marker, not for the menu.

**The selected session row has no action button.** `[class*="_sessionRow"]` covers both the selected row (no `_rowActions`) and ordinary rows (one `aria-label="Session actions for …"` button). Pick the first row that actually has a button.

**`pnpm test | grep` hides the exit code.** The pipeline reports grep's status. Redirect to a file and check `$?` for anything that gates a commit.

**Live checks are meaningless against a stale `lib/`.** The client bundle is served from disk, so a client change is live after a rebuild — but host changes need a `dsh web` restart, and a `pnpm build` that was skipped leaves the browser running old code. Rebuild before every live validation; restart before validating a host capability.

**An unlaid-out copy reads normal in computed style but has a zero rect.** An ancestor with `display: none` leaves the node connected and `getComputedStyle` still reports the rule's values, while `getBoundingClientRect()` returns all zeros — so a probe that filters or asserts on computed style alone selects a node that is not laid out. `content-visibility: hidden` is a different class: computed style and the rect both read normal and only `document.elementFromPoint()` at the node's own centre catches it. This host hides the whole composer through `[data-chain-overlay-fallback="conversation.composer"]` with an inline `display: none` when another contribution is elected in that chain (an unanswered question card), so the fallback composer stays connected, style-normal and unclickable. Rule: filter candidates by `rect.width > 0` and hit-test with `elementFromPoint` before asserting geometry; never assert on computed styles alone.

**A contract scan `hit` is not a render.** The hash branch of `scripts/cdp-compat-contracts.mjs` reports `HIT` when the fragment appears in some element's `class` list; it never asks whether a rule owns that class or whether the element is painted, so a class whose rule is overridden, or that sits on a subtree hidden by an ancestor's `display: none`, hits while nothing renders. A scanner that also counts a needle found in a loaded stylesheet's `cssText` rather than in the rendered tree has the same gap — the selector existing somewhere in the CSS says nothing about a match that paints. Rule: read the scan as a rename detector (a `MISS` on a non-lazy entry means the marker/class is gone) and assert "it renders" with a real browser probe — a non-zero rect, a visible control, a painted `svg path`.

**Headless synthesized touch hands DOM focus to the tapped button.** A probe that drives the composer by `Input.dispatchTouchEvent` moves focus to the button on the synthesized mousedown, and the host's command menu reads `keyboard.caretSpan()` right after it re-focuses the editor — that span does not survive the blur, so the menu never opens and the probe fails on a build that is correct. A synthetic `element.click()` (no pointerdown) keeps the editor focused, which is the state a phone is in, and still exercises the same React `onClick` plus every document-level capture/bubble listener the plugin owns. Rule: drive tap-to-open surfaces with `element.click()`; keep the parts that need a real finger (IME, focus release) as INFO rows and verify them on a device, never as a gate.

**A page that navigated away reads exactly like a successful exit.** Asserting "the panel is gone" after a back press passes on a page that left the app entirely: the panel really is gone, the FAB mode reads `null`, and the state evaluation may still succeed because the new document finished loading. Require the app's own marker in the same assertion (the plugin frame marker, a non-null FAB mode) before calling it an exit. Two mechanical consequences: the `history.back()` evaluate itself can reject with `Inspected target navigated or closed` as the document unloads — catch it, do not let it kill the probe — and a single uncaught rejection in a top-level `await main()` ends the run with a stack instead of a FAIL row, so wrap the entry point too.

**On iOS the keyboard follows DOM focus, so a blur after the fact is not a fix.** When a host handler calls `element.focus()` (the composer toolbar buttons call `focusDraftEditor` from `onClick`), iOS raises the keyboard and a later `blur()` does not take it back — the keyboard is already up. The only thing that works is not letting that `focus()` land: `src/client/effects/editor-focus-shadow.ts` replaces the editor element's `focus` with a no-op for the length of the interaction (own property over the prototype method, so `delete` restores it). Android behaves differently and was already covered by blurring. The blur that fixes the opposite problem (an IME re-rising into an editor whose keyboard is hidden) is only safe in THAT state: blurring an editor whose keyboard is UP starts the hide animation, and since the keyboard is the composer's floor the whole row slides down under the finger — reported on iOS as "the composer jumps on the first tap", with later taps looking fine because the keyboard was already down by then. Gate that blur on the keyboard actually being hidden, read from `visualViewport` (`innerHeight - vv.height > ~120px`, plus a pinch-zoom guard so a zoomed viewport is not mistaken for a keyboard).

Two more rules come with the technique: it must be armed on the **click** path as well as on pointerdown (a synthetic or assistive click has no pointerdown at all — measured: with only the pointerdown arming, the editor was focused again at 900ms), and it must be **bounded and self-lifting** (next tap, menu gone from the DOM, hard cap, dispose). A shadow that never lifts blocks every later focus and the keyboard can never be opened again — that is the bug the community plugin shipped and fixed in v3.0.1.

## Host contract traps

**Never infer a panel from the absence of a conversation.** A global panel page replaces the conversation, so it also has no `[data-phase]` element — which made `heroPhase` ("no active phase") true on a panel page and mounted the drawer FAB over the panel's own content (`10,72`, `z-index: 21`, `pointer-events: auto`: it covered the subtitle *and* swallowed taps, so a screenshot was needed to see it). Ask the positive question instead: `[data-plugin-panel]` on the panel page root, or `aria-current="page"` on the selected sidebar panel row. This is the second bug in this package traced to the same absence-based inference (the drawer close whitelist was the first), so treat "X is missing, therefore state Y" as a smell in any new reconcile task. Note also that `data-sidebar-collapsed` is *absent entirely* while a panel occupies the frame, so that attribute alone cannot report drawer state during a panel.

**The plugin-facing session snapshot is not the one the source implies.** `ctx.sessions.list.getSnapshot()` was expected to expose `ids` + `byId` (the controller's own store shape), but the strict reader threw `Cannot read properties of undefined (reading 'filter')` against this host. `session-menu.ts` now reads both generations (`ids`/`byId` and a manager-style `items`); do the same for any new consumer, and never assume a snapshot shape from source alone — probe it.

**Title is the only row → session key the DOM offers.** Rows carry no id. Resolution matches the row's rendered label against the session snapshot and disambiguates duplicates by the owning workspace; when that is still ambiguous the flow refuses. Never "fix" that by taking the nth match: deleting the wrong session is unrecoverable.

**Host internals are probed, not imported.** `delete-session.ts` reads `agents.store` / `sessions.store.detach` behind optional chaining, and refuses a live session (`409 session-busy`) when the host exposes no disposal face. On DSH ≤0.1.6-alpha.2 it does not (observed 0.1.5-rc.2 through 0.1.6-alpha.2), so only cold sessions are deletable there — that is a recorded phase-1 limit, not a bug to paper over.

**`src/index.ts` cannot be imported by `node:test`.** Its host imports carry the `.js` specifier tsc emits, so a test importing it fails to resolve. Host-side pure helpers live in their own module (`delete-route.ts`) and are tested there.

**`[data-phase]` is a double-namespace attribute.** Two different elements carry it: the conversation main panel publishes `hero|active|settling` (the conversation lifecycle) and the composer's draft editor publishes `plain|inert` (the submit machine). A probe that reads a bare `[data-phase]` therefore picks whichever element the selector reaches first, and a compound selector such as `[data-phase] button` scopes to the wrong subtree without failing loudly. Rule: always assert a specific value (`[data-phase="active"]`); a bare attribute prefix is acceptable only as a specificity fence, never as a state read.

## Repo / process traps

**The public-docs blacklist rejects contributor checkout paths.** A test fixture or doc containing a real `home/<user>/…` path fails the pre-commit blacklist. Use placeholders in fixtures and derive machine paths at runtime (`homedir()`, `import.meta.url`).

**Comment text can satisfy a CSS contract assertion.** A selector regex or a "does not contain X" check will match prose in the block comment above the rule. Strip comments (`/\/\*[\s\S]*?\*\//g`) before matching selectors.

**A stacked PR dies with its base branch.** When the base branch is deleted by a squash-merge, GitHub closes the dependent PR and refuses both `gh pr reopen` and a base-branch edit. Rebase only your own commits onto the new `master` (`git rebase --onto master <old-base-tip> <branch>`), push, and open a fresh PR that references the closed one.

**The git guard mints a ticket per exact command string.** Appending even a second command (`; gh pr view …`) changes the text and invalidates the approval. Present the command, approve, then re-run it byte-identically.

## CSS / DOM traps (session-delete dialog, 2026-09-12)

**A fixed-position dialog inside the AppFrame paints under the drawer.** The drawer column (`fIyUMG_sidebarCol`) is `z-index: 150` while the frame's own overlay layer is 20, so a dialog appended to the frame at `z-index: 70` rendered *behind* the open drawer and its buttons could not be tapped. Modals belong on `document.body` with a layer above the shell scale (mask 199 / card 200). Verify with `document.elementFromPoint()` at the dialog's own centre and at each button centre — a `role="dialog"` that exists is not a dialog that is reachable.

**A descendant selector out-specifies a bare attribute selector.** `[data-mobile-nav="delete-confirm-actions"] button` is (0,1,1); `[data-mobile-nav="delete-confirm-yes"]` is (0,1,0). The generic rule therefore won and the destructive button rendered as a second neutral button. Repeat the scope in the override, and assert the computed colour in a probe, not just the presence of a rule.

**Never write a backtick inside a CSS-in-TS template literal.** A `...] button`-style mention in a comment terminates the string; `tsc` then fails with a confusing `',' expected` far from the real cause. (Prose in that file must avoid backticks entirely.)

**`pnpm verify` failing with a parser error in a `.css.ts` file is a template-literal syntax error**, not a CSS problem — read the reported line, not the CSS semantics.

# Maintenance — pitfalls

Traps that cost real debugging time in this package. Each entry says what went
wrong, how it presented, and the rule that prevents it.

## CDP / probe traps

**Headless Chrome has no pointer unless you emulate one.** `Emulation.setDeviceMetricsOverride {mobile: true}` alone reports `(pointer: none)` with `maxTouchPoints: 0`, so a `(pointer: coarse)`-gated mobile branch never arms. Every probe must call `Emulation.setTouchEmulationEnabled {enabled: true, maxTouchPoints: 5}` and assert the query. `maxTouchPoints: 0` is rejected with `-32602` even while disabling, so only send the field when enabling.

**A probe that navigates with `?token=` must compare the origin.** The raw port consumes the launch token and redirects to the bare origin, so a `href.startsWith(url)` page-load gate never matches. Compare `new URL(href).origin`.

**A yield probe must assert its precondition.** The swipe-yield probe passed falsely while the drawer was already open: an edge swipe *closes* an open drawer, which reads exactly like "the yield worked". Assert the drawer is closed before each scenario, and treat a failed reset as a scenario failure.

**Injection happens on the next animation frame.** The session-row menu is a React portal; the plugin appends its item in an rAF after the portal mounts. A probe that snapshots the menu immediately reads `injected=0`. Wait for the marker, not for the menu.

**The selected session row has no action button.** `[class*="_sessionRow"]` covers both the selected row (no `_rowActions`) and ordinary rows (one `aria-label="Session actions for …"` button). Pick the first row that actually has a button.

**`pnpm test | grep` hides the exit code.** The pipeline reports grep's status. Redirect to a file and check `$?` for anything that gates a commit.

**Live checks are meaningless against a stale `lib/`.** The client bundle is served from disk, so a client change is live after a rebuild — but host changes need a `dsh web` restart, and a `pnpm build` that was skipped leaves the browser running old code. Rebuild before every live validation; restart before validating a host capability.

## Host contract traps

**The plugin-facing session snapshot is not the one the source implies.** `ctx.sessions.list.getSnapshot()` was expected to expose `ids` + `byId` (the controller's own store shape), but the strict reader threw `Cannot read properties of undefined (reading 'filter')` against this host. `session-menu.ts` now reads both generations (`ids`/`byId` and a manager-style `items`); do the same for any new consumer, and never assume a snapshot shape from source alone — probe it.

**Title is the only row → session key the DOM offers.** Rows carry no id. Resolution matches the row's rendered label against the session snapshot and disambiguates duplicates by the owning workspace; when that is still ambiguous the flow refuses. Never "fix" that by taking the nth match: deleting the wrong session is unrecoverable.

**Host internals are probed, not imported.** `delete-session.ts` reads `agents.store` / `sessions.store.detach` behind optional chaining, and refuses a live session (`409 session-busy`) when the host exposes no disposal face. On DSH 0.1.5-rc.2 it does not, so only cold sessions are deletable there — that is a recorded phase-1 limit, not a bug to paper over.

**`src/index.ts` cannot be imported by `node:test`.** Its host imports carry the `.js` specifier tsc emits, so a test importing it fails to resolve. Host-side pure helpers live in their own module (`delete-route.ts`) and are tested there.

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

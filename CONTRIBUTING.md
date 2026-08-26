# Contributing to dsh-maestro-mobile

Thank you for contributing to **dsh-maestro-mobile** (`@ddtcorex/dsh-maestro-mobile`) — portrait and mobile adaptation for the DeepSeek Harness Web UI (overlay drawer, full-width conversation, sheet-based dialogs, safe-area handling). Client-only Cordis plugin (`id: dsh-maestro-mobile`).

## Getting Started

1. **Fork and clone** `github.com/ddtcorex/dsh-maestro-mobile`.
2. Install dependencies (requires Node.js 22+, pnpm 10+):

   ```bash
   pnpm install
   ```

3. Build the Host + Client plugin (TypeScript → `lib/` + inlined client bundle):

   ```bash
   pnpm build        # tsc -p tsconfig.json && tsc -p tsconfig.client.json && node scripts/build-client.mjs
   ```

4. Open the project in your editor. Key layout:

   ```
   src/index.ts           # host half (intentionally empty apply(), row appears in Loader)
   src/client/index.tsx   # browser half — slots, locale, <style> inject, effects
   src/client/effects/    # DOM effects (reconciler-core.ts engine + phone-chrome.ts adapter)
   src/client/styles/     # CSS as TS string modules (base → layout → compat → misc order)
   lib/                   # committed build output (host ESM + inlined client bundle + d.ts)
   tests/                 # node:test suites (reconciler-core)
   cordis.patch.yml       # Cordis patch row
   ```

   `lib/` is committed — a change is incomplete until `pnpm build` refreshes it. Never hand-edit `lib/`.

## Workflow

This repository follows the workspace Superpowers workflow described in `AGENTS.md` for any non-trivial change:

1. **brainstorming** — explore intent, requirements, and design before writing code.
2. **writing-plans** — turn the approved design into a task-by-task plan with exact test and implementation sketches. Plans are transient — delete them once the batch ships.
3. **executing-plans** — implement task by task with strict **TDD**: write a failing test first, verify RED, implement, verify GREEN, then commit that task before starting the next. Do not commit while tests are red.

For small single-file fixes, a focused PR with tests still applies. Describe durable outcomes in the PR body.

## Branch Naming

Never commit directly to `master`. Start a feature branch per work session:

- `fix/<topic>` — bug fixes
- `feat/<topic>` — new features (drawer, sheet, safe-area, reconciler)
- `docs/<topic>` — documentation-only changes

Rebase (not merge) when the base moves: `git fetch origin && git rebase origin/master`.

## Conventional Commits

All commit subjects **must** follow [Conventional Commits](https://www.conventionalcommits.org/) in imperative mood:

```
<type>(<scope>): <subject>

<body — why, not what>

Refs: #<issue>
```

- **Types (closed list):** `feat` `fix` `docs` `chore` `refactor` `perf` `test` `build` `ci` `revert`
- **Scope:** optional, without the `dsh-maestro-` prefix — e.g. `feat(mobile):`, `fix(drawer):`, `docs(readme):`
- **Subject:** imperative, lowercase first word, ≤ 72 chars, no trailing period
- **Body:** explain *why* and trade-offs when non-trivial
- **Breaking changes:** `feat!: <subject>` plus a `BREAKING CHANGE:` footer

One TDD task = one commit while executing a plan; squash at merge time if the history reads better squashed.

## Validation

Run these before opening a PR (match depth to risk):

```bash
pnpm verify      # typecheck host + client — tsc --noEmit (both tsconfigs)
pnpm test        # alias for test:core — node --test tests/reconciler-core.test.ts
pnpm build       # tsc host + client && node scripts/build-client.mjs -> lib/
```

After `pnpm build`, verify `lib/` was refreshed (`git status` should show changed `lib/` if sources changed).

Additional live checks when relevant (requires running DSH Web on :3080):

```bash
# CDP smoke probe (phone/tablet/desktop geometries)
DSH_PROBE_SESSION_ID=<id> pnpm smoke:cdp

# Full workspace verify (all packages)
pnpm --dir ../../maestro-workspace -r verify
```

Visual validation (live DSH Web, not just curl/grep) — check both sides of 1024px:

- **Phone ~390px**: rail hidden; drawer/FAB/backdrop open/close; Escape; session-row actions don't close drawer; sheets safe-area
- **Tablet 768–1023px**: centered width-constrained sheets
- **Desktop ≥1024px**: no layout change vs plugin disabled

Do not claim verified/done/clean without having actually run the checks — be ready to paste exact command output in the PR.

## Pull Requests

1. Push your branch and open a PR into `master`.
2. Fill out `.github/PULL_REQUEST_TEMPLATE.md` (Summary, Why, Changes, Validation, Linked Issues).
3. Link the PR to the plan that produced it when the Superpowers workflow was used.
4. Ensure CI (`pnpm verify` / `pnpm test` / `pnpm build` via `dsh-maestro-ci`) is green.

## Package Visibility

This package is public (`"private": false` — field omitted would also default to public, but we set it explicitly). Never set `"private": true` in `package.json`. Publishing uses `pnpm publish --access public` only — never `npm publish` (would leave `workspace:` in the tarball).

Verify before publish:

```bash
grep '"private": false' package.json
pnpm publish --dry-run 2>&1 | grep -q "workspace:" && echo "FAIL workspace left" || echo "OK"
```

## Public Word Blacklist

This repo is public — never put private project/client names or host paths into source, tests, docs, or commit messages. The single source for blacklisted words is at the meta root `docs/PUBLIC_WORD_BLACKLIST.md` (not copied into this repo — that would publish the private names). Before pushing a public PR, run from the meta root:

```bash
node scripts/check-public-blacklist.mjs        # must be ✅ 0 hits
node scripts/check-public-blacklist.mjs --suggest  # review new suspects
```

Replace any hit with the placeholder from that doc (`example-project`, `<workspace-root>/...`, `example.test`).

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you agree to its terms.

## Questions or Security Reports

- General questions: open a GitHub Discussion or issue.
- Contact maintainer: [kaido4492@gmail.com](mailto:kaido4492@gmail.com)
- Security vulnerabilities: use GitHub's private advisory reporting at `https://github.com/ddtcorex/dsh-maestro-mobile/security/advisories` — do not file a public issue.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).

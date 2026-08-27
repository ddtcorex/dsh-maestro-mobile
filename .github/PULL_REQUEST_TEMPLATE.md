## Summary

Describe the change in 2–3 bullets.

## Why

Explain the problem this PR solves and why this approach was chosen.

## Changes

- [ ] Code updated (`src/` / `src/client/` — drawer, sheets, reconciler, styles)
- [ ] Tests added or updated (`tests/` — node:test)
- [ ] Documentation updated (`README.md` / `CONTRIBUTING.md` if needed)
- [ ] `lib/` rebuilt (`pnpm build` — host + client + build-client.mjs)

## Validation

Paste exact commands and outcomes (do not claim verified without evidence):

```bash
pnpm verify
pnpm test
pnpm build
```

Additional checks (when relevant):

```bash
DSH_PROBE_SESSION_ID=<id> pnpm smoke:cdp
pnpm --dir ../../maestro-workspace -r verify
```

## Linked Issues

Fixes #

## Checklist

- [ ] Branch is `feat/...`, `fix/...`, or `docs/...` off `master` (no direct commits to `master`)
- [ ] Commits follow Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`) in imperative mood
- [ ] Followed the Superpowers 3-phase workflow (brainstorming → writing-plans → executing-plans with TDD) where applicable
- [ ] `pnpm verify` / `pnpm test` / `pnpm build` are green
- [ ] `private: false` still set in `package.json` (public package — never `private: true`)
- [ ] No private words (example-project, host paths) — `node ../../scripts/check-public-blacklist.mjs` is ✅ 0 hits at meta root

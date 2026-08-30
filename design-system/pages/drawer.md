# drawer — Drawer + Backdrop

Pattern: App Shell drawer (DSH AppFrame 3-col → 1-col on <1024)
Reuse: DSH AppFrame grid + SIDEBAR_AUTO_COLLAPSE, shell.overlay slot (future), --dsw-* tokens

- Grid: `[data-mobile-nav="frame"] { grid-template-columns:1fr 0 0 }`
- Drawer: first-child absolute `max-content` `max-width:92vw` `translateX(-110%)` → `transform:none` open
- Backdrop: currently reconciler task `data-mobile-nav="backdrop"` z30; v2 migrates to `shell.overlay` z20 overlayLayer
- Safe-area: `padding-top: env(safe-area-inset-top)` on frame + drawer
- Motion: .28s var(--ds-ease-in-out), prefers-reduced-motion none
- A11y: Escape closes (yields to [aria-modal]), nav-tap closes via observer (preserves iOS click), kebab buttons excluded

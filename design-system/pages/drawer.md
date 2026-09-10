# drawer — Drawer + Backdrop

Pattern: App Shell drawer (DSH AppFrame 3-col → 1-col on <1024)
Reuse: DSH AppFrame grid + SIDEBAR_AUTO_COLLAPSE, shell.overlay slot, --dsw-* tokens

- Grid: `[data-mobile-nav="frame"] { grid-template-columns:1fr 0 0 }`
- Drawer: first-child absolute `max-content` `max-width:92vw` `translateX(-110%)` → `transform:none` open, z150
- Backdrop: `shell.overlay` slot (AppFrame overlayLayer z20/100) via ShellOverlay — the legacy reconciler task is gone
- Safe-area: `padding-top: env(safe-area-inset-top)` on frame + drawer
- Motion: .28s var(--ds-ease-in-out), prefers-reduced-motion none
- A11y: Escape closes (yields to [aria-modal]), nav-tap closes via observer (preserves iOS click), kebab buttons excluded

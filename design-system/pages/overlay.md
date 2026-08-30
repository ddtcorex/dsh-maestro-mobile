# overlay — Backdrop + FAB via shell.overlay

Pattern: DSH shell.overlay list slot (AppFrame overlayLayer z20)
Reuse: AppFrame overlayLayer (absolute inset 0, pointer-events none → auto per child), --dsw-* tokens

- Backdrop: ShellOverlay component, renders when `!data-sidebar-collapsed` && narrow
  - Runs in overlayLayer, not frame.appendChild — DSH-native, correct z below drawer (z40) above center
  - Legacy `createOverlayTask` removed from reconciler, kept in overlay-backdrop-fab.ts for compat
- FAB: hero/blank phase fallback, `top: calc(env(safe-area-inset-top)+72px)` left 10, 38px circle, shadow
  - Also via shell.overlay, same lifecycle as backdrop
- Right-panel backdrop stays as reconciler task (panel-host outside shell.overlay, z39)
- Motion: fade .2s var(--ds-ease-in-out), reduced-motion none

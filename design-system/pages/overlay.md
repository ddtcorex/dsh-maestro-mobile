# overlay — Backdrop + FAB via shell.overlay

Pattern: DSH shell.overlay list slot (AppFrame overlayLayer z20)
Reuse: AppFrame overlayLayer (absolute inset 0, pointer-events none → auto per child), --dsw-* tokens

- Backdrop: ShellOverlay component, renders when `!data-sidebar-collapsed` && narrow
  - Runs in overlayLayer, not frame.appendChild — DSH-native, correct z below the drawer (drawer is z150, above shell.overlay z100)
  - Legacy `createOverlayTask` stays in overlay-backdrop-fab.ts but is no longer registered by the reconciler
- FAB: hero/blank phase fallback, `top: calc(env(safe-area-inset-top)+72px)` left 10, 38px circle, shadow
  - Also via shell.overlay, same lifecycle as backdrop
- Motion: fade .2s var(--ds-ease-in-out), reduced-motion none

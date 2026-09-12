# session-delete — confirmation dialog

Pattern: centred modal card (NOT a bottom sheet) over the shell mask
Reuse: DSH mask + dialog tokens; `misc.css.ts` § session delete (gated on `(pointer: coarse)`, because the menu item exists at every width)

## Contract

- Hosted on `document.body`, never inside the AppFrame: the drawer column
  (`fIyUMG_sidebarCol`) is `z-index: 150` and the frame's own overlay layer 20,
  so a dialog appended to the frame painted UNDER the open drawer and its
  buttons were unreachable. Layers: mask 199, card 200.
- Centred with `inset: 0; margin: auto;` (not a transform) so the entrance
  animation cannot fight the centring. `width: min(calc(100vw - 32px), 380px)`,
  `height: fit-content`, `max-height: calc(100dvh - 48px)`, `overflow-y: auto`.
- Surface: `--dsw-alias-bg-layer-2`, `1px solid --dsw-alias-border-l1`,
  `border-radius: 24px`, `--dsw-shadow-lv3`.
- Mask: `--dsw-alias-bg-mask-1` + `backdrop-filter: var(--dsw-mask-blur)`.
- Motion: mask fade .18s, card `sheet-in` .22s, both `--ds-ease-out`;
  `prefers-reduced-motion: reduce` disables both.
- Type: title 16/24 wt500 `--dsw-alias-label-primary`; description 14/22
  `--dsw-alias-label-secondary`; error line 13/19 `--dsw-alias-state-error-primary`.
- Actions: right-aligned, gap 8, buttons `min-height: 44px` (touch target),
  radius 12, focus ring 2px `--dsw-alias-state-business-primary`.
  **Destructive = danger outline** (token red border + label, transparent fill).
  A filled red button would need an on-error foreground token and DSH has none,
  so the label could invert under a light-fill theme. The override repeats the
  actions scope: the plain actions-button rule is (0,1,1) and beats a bare
  `[data-mobile-nav="delete-confirm-yes"]` at (0,1,0) — that is how the danger
  colour went missing once already.
- a11y: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` → the title id,
  initial focus on the SAFE action (Cancel), focus restored on close, Tab cycles
  the two buttons, Escape cancels, failures announced in a `role="alert"` line.

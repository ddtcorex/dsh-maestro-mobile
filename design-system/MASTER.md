# MASTER — dsh-maestro-mobile Design System
Pattern: App Shell + Drawer + Bottom Sheet
Style: Minimalism & Swiss + Bento Grid (settings cards)
Colors: DSH tokens only — --dsw-alias-* / --ds-* (no custom hex)
Typography: DSH system font (Inter fallback) 14/22 body, 16/24 title wt500
Spacing: 4/6/8/12/16/24 gap scale, radius 12/14/18/24, safe-area env()
Effects: drawer .28s var(--ds-ease-in-out), sheet .22s var(--ds-ease-out), fade .18s, focus ring 2px

## Tokens (reuse DSH — zero custom hex)

All colors resolve through DSH ThemePresenter (light/dark via body[data-ds-dark-theme]):

- `--dsw-alias-bg-base` / `--dsw-alias-bg-layer-2` / `--dsw-alias-bg-overlay` — surfaces
- `--dsw-alias-bg-mask-1` + `--dsw-mask-blur` — modal mask
- `--dsw-alias-border-l1` / `--dsw-alias-border-l2` / `--dsw-alias-border-inverted` — borders
- `--dsw-alias-label-primary` / `--dsw-alias-label-secondary` / `--dsw-alias-label-tertiary` — text
- `--dsw-alias-brand-primary` / `--dsw-alias-state-business-primary` — accent/focus
- `--dsw-alias-interactive-bg-hover` / `--dsw-alias-interactive-bg-active` — hover
- `--dsw-alias-button-primary-fill` / `--dsw-alias-button-floating-fill` — buttons
- `--dsw-specific-sidebar-fill` — sidebar column
- `--ds-ease-in-out` / `--ds-ease-out` / `--ds-transition-duration-slow` — motion
- `--dsw-shadow-lv3` — sheet shadow
- `env(safe-area-inset-top)` / `env(safe-area-inset-bottom)` — notch/home indicator

Contrast: 4.5:1 verified on both themes via DSH token pairs (label-primary on bg-base).

## Breakpoints (single source: DSH AppFrame)

- `SIDEBAR_AUTO_COLLAPSE = 1024` — narrow <1024 collapses sidebar to 56px rail
- Mobile: `(max-width: 1023px)` — drawer + sheets
- Tablet: `(min-width: 768px) and (max-width: 1023px)` — centered sheets max 720px
- Desktop: `(min-width: 1024px)` — no-op, hide [data-mobile-nav]
- Tiny: `(max-width: 359px)` / `(max-width: 440px)` — progressive header crowding guards

## Components

- **Drawer**: AppFrame grid override `grid-template-columns:1fr 0 0` + absolute first-child `max-content` `max-width:92vw` `transform:translateX(-110%)` → `transform:none` when open
- **Backdrop**: `shell.overlay` slot (DSH overlayLayer z-index:20) — replaces manual absolute div
- **BottomSheet**: Modal headless variant, r24, layer-2 fill, sheet-in .22s, mask fade .18s, drag handle 36x4
- **Settings Sheet**: SettingsRoot modal → bottom sheet on mobile: overlay flex-end, panel 100% / 92dvh r24-top, nav pills row scroll, header h44 close 36, options scroll safe-area
- **Composer**: container-type:inline-size row, permission/model triggers flex shrink with ellipsis, dropdown centered max 320px
- **Safe-area**: `padding-top: env(safe-area-inset-top)` on frame, `padding-bottom: max(12px, env(safe-area-inset-bottom))` on composer seat / options

## A11y & Motion

- Touch target 28-44px (toggle 28, drawer actions 34, FAB 38, sheet handle 4) + gap 6-8px
- focus-visible ring 2px, -webkit-tap-highlight-color transparent
- prefers-reduced-motion: reduce → animation/transition none
- aria-label/title on all icon buttons, locale NS mobileNav
- Safari input-focus zoom guard: iOS font-size >=16px on [data-question-key] inputs

## Avoid

- No hardcoded hex, no custom shadow/radius outside DSH tokens
- No [class*="_hash"] without :not guard for prefix overlap (tab vs tabBar vs tabList)
- No [class$=_frag] suffix selectors
- No transform:translateX(0) on open drawer (use transform:none)
- No full-tree MutationObserver — one narrow observer per domain

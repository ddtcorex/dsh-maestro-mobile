# settings — Settings sheet (mobile bottom sheet)

Pattern: Bottom Sheet + Segmented Tabs (horizontal pills) + Bento content
Reuse: DSH SettingsRoot tokens (--dsw-alias-bg-layer-2/mask-1, --dsw-mask-blur, --dsw-shadow-lv3, --ds-ease-out), Modal mask/dialog contract

- Overlay: `align-items:flex-end; justify-content:center; padding:0` on `[class*="_overlay"]:has(> [class*="_panel"])`, mask `bg-mask-1 + blur` fade .18s
- Panel: `width:100% max-height:min(92dvh,720px) min-height:min(52dvh,420px)` `flex-direction:column` `r24 24 0 0` `layer-2` `lv3` `padding-top:10` `sheet-in .22s`, `::before` handle 36x4 `--dsw-alias-border-l2`
- Nav: `width:100%` col gap 8 `pad 0 16 0`; `navTitle` 16/24 wt500; `navList` row nowrap gap 6 `overflow-x:auto` `scrollbar-width:none` + bottom border `border-l1`, `pad-bottom:8`
- Pill: `h36` `r999` `border-l1` transparent → hover `interactive-bg-hover`, active `sidebar-nav-item-active` + border active, focus-visible ring 2px `state-business-primary`
- Content: `flex:1 min-height:0` col; `header` `h44` `pad 8 12 8 16` `border-bottom l1` `align:center`; `close` 36 circle hover + focus ring; `options` `flex:1 overflow-y:auto` `pad 16 16 calc(16+safe-bottom)` `-webkit-overflow-scrolling:touch`
- Bento: `[class*="_section"]` `width:100% max-width:none` on mobile so cards fill sheet
- Tablet 768-1023: overlay `align:center pad 24 16 calc(16+safe-bottom)`, panel `min(calc(100vw-32),720px)` `max-height:min(82dvh,640px)` `r24` centered
- Desktop ≥1024: `::before` handle hidden
- Motion: `prefers-reduced-motion` → none
- A11y: pill 36 + gap 6 (44 effective with padding), close 36, tap-highlight transparent, contrast via label-primary/layer-2

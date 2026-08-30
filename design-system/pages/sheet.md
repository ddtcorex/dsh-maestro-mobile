# sheet — BottomSheet + Explorer/Preview sheets

Pattern: Modal headless → bottom sheet on mobile (settings = legacy Modal, explorer/preview = aionui cols)
Reuse: DSH Modal mask (--dsw-alias-bg-mask-1 + --dsw-mask-blur), dialog (--dsw-alias-bg-layer-2, r24, --dsw-shadow-lv3), --ds-ease-out

- BottomSheet component: fixed root flex-end, mask fade .18s, dialog sheet-in .22s, handle 36x4, max-height 55dvh
- Explorer/preview sheets: same tokens via explorer-sheet.css.ts — bg-layer-2, border-l1, shadow-lv3, sheet-in .22s, searchBox r12
- Legacy settings Modal (aria-modal :has(button)): now also r24 + layer-2 + shadow-lv3 + ::before handle 36x4 to match BottomSheet
- Tablet 768-1023: centered min(calc(100vw-32),720px) radius 24
- Desktop ≥1024: centered 380px 80dvh (no-op for mobile)
- See explorer-sheet.css.ts for aionui polish

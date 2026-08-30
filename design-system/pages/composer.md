# composer — Composer row

Pattern: Inline flex with container query
Reuse: DSH composer card (position:relative), input bar slots

- Row: container-type inline-size, flex-wrap nowrap, gap 6, overflow visible (dropdowns)
- Permission trigger: flex 1 1 auto + ellipsis, label hidden <359px
- Model pill: plus meter + send right cluster, margin-left:auto on model, -4px trim on meter
- Safe-area: [data-composer-seat] padding-bottom max(12px, env(safe-area-inset-bottom))
- iOS guard: [data-question-key] inputs font-size 16px

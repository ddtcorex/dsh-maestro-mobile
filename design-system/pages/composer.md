# composer — Composer row

Pattern: Inline flex with container query
Reuse: DSH composer card (position:relative), input bar slots

- Row: container-type inline-size, flex-wrap nowrap, gap 6, overflow visible (dropdowns)
- Permission trigger: flex 1 1 auto + ellipsis, label hidden <359px
- Model pill: plus meter + send right cluster, margin-left:auto on model, -4px trim on meter
- Safe-area: [data-composer-seat] padding-bottom max(12px, env(safe-area-inset-bottom))
- iOS guard: [data-question-key] inputs font-size 16px
- Ask card ([data-question-key], ask_user_question): question / option copy / markdown detail carry overflow-wrap anywhere (the card clips horizontally), and the card is the single vertical scrollport — the question lives in the card header, so a long one must scroll together with the options instead of squeezing the option seat to zero height. The footer keeps its mobile wrap.
- Session-header rules are anchored on [data-slot="conversation.session.header"] > header, never a bare descendant header, so they cannot reach the Ask card's own header.

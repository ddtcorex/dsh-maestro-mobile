// sheet — DSH-native bottom sheet (reuses Modal tokens)
// See design-system/MASTER.md

export const SHEET_CSS = `
/* ---------- BottomSheet (DSH Modal bottom-sheet variant) ---------- */
[data-mobile-sheet="root"] {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0;
}
[data-mobile-sheet="mask"] {
  position: absolute;
  inset: 0;
  background: var(--dsw-alias-bg-mask-1, rgba(0,0,0,.24));
  backdrop-filter: var(--dsw-mask-blur, blur(2px));
  animation: dsh-maestro-mobile-fade .18s var(--ds-ease-out, ease-in-out);
}
[data-mobile-sheet="dialog"] {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 100%;
  max-height: min(55dvh, 460px);
  padding: 10px 0 calc(12px + env(safe-area-inset-bottom, 0px));
  background: var(--dsw-alias-bg-layer-2, #fff);
  border: 1px solid var(--dsw-alias-border-inverted, rgba(0,0,0,.08));
  border-radius: 24px 24px 0 0;
  box-shadow: var(--dsw-shadow-lv3, 0 8px 32px rgba(0,0,0,.18));
  animation: dsh-maestro-mobile-sheet-in .22s var(--ds-ease-out, ease-in-out);
}
[data-mobile-sheet="handle"] {
  align-self: center;
  width: 36px;
  height: 4px;
  margin: 2px 0 10px;
  border-radius: 999px;
  background: var(--dsw-alias-border-l2, rgba(0,0,0,.22));
}
[data-mobile-sheet="header"] {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 14px 8px 24px;
}
[data-mobile-sheet="title"] {
  margin: 0;
  font-size: 16px;
  line-height: 24px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary, #111);
}
[data-mobile-sheet="close"] {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #666);
  cursor: pointer;
}
[data-mobile-sheet="close"]:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.06));
}
[data-mobile-sheet="body"] {
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 0 24px;
  min-height: 0;
}
@media (min-width: 768px) and (max-width: 1023px) {
  [data-mobile-sheet="dialog"] {
    width: min(calc(100vw - 32px), 720px);
    border-radius: 24px;
    margin: 0 auto 12px;
  }
}
@media (prefers-reduced-motion: reduce) {
  [data-mobile-sheet="mask"],
  [data-mobile-sheet="dialog"] {
    animation: none !important;
  }
}
@media (min-width: 1024px) {
  [data-mobile-sheet="root"] {
    align-items: center;
    padding: 24px;
  }
  [data-mobile-sheet="dialog"] {
    width: min(380px, 100%);
    max-height: min(80dvh, 640px);
    border-radius: 24px;
  }
}
`

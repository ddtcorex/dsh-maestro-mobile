import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { installMobileEffect } from './phone-chrome.ts'

/**
 * Soft-keyboard guard for composer toolbar buttons on touch devices.
 *
 * Upstream InputBar `keepFocus`
 * (deepseek-harness/packages/client/ui-conversation/src/client/skeleton/InputBar.tsx)
 * runs on every composer toolbar button's `onMouseDown` and ends with
 * `editor.getRootElement()?.focus({ preventScroll: true })`. That keeps the
 * caret in the editor for desktop typing, but on touch devices focusing the
 * contenteditable pops the soft keyboard on every tap of Commands / Stop /
 * Send — the reported "每次点都弹键盘".
 *
 * This is the local half of the upstream fix (the foundation source is not
 * edited in-tree). While a touch tap is the origin of a synthesized mousedown,
 * stop that mousedown from propagating to React's `onMouseDown` (keepFocus)
 * for toolbar `button`s inside the composer capsule `[data-composer-card]` (the
 * stable root that wraps both the contenteditable and the toolbar), so the
 * editor is not force-focused. The button's `click` is a separate event and
 * still fires, so the Commands menu, file picker, Stop, and Send all work —
 * only the unwanted keyboard pop is suppressed. The @ trigger menu
 * (`[data-trigger-menu]` in ui-input-trigger MenuView.tsx) lives inside the
 * same capsule but its rows pick on React `onMouseDown`, so it is explicitly
 * exempted — otherwise touch taps on @ candidates never reach `onPick`.
 * A direct tap on the editor
 * div (not a button) matches no `button` and is left alone, so the keyboard
 * still opens when the user wants to type. Mouse users (hardware keyboard) are
 * untouched because their mousedowns are not touch-originated.
 */
const TOUCH_GRACE_MS = 600

/**
 * Composer capsule root. Hardcoded in InputBar.tsx as the wrapper around both
 * the contenteditable and the toolbar. Stable across ui-conversation rebuilds
 * (the keepFocus logic itself is the part that must be audited if upstream
 * changes, not this marker).
 */
const COMPOSER_CARD_SELECTOR = '[data-composer-card]'

/**
 * Trigger-menu root. Set on the menu shell in
 * ui-input-trigger MenuView.tsx (`data-trigger-menu=""`); it wraps both the
 * crumb header and the candidate listbox, so one closest() check exempts row
 * picks and crumb picks together.
 */
const TRIGGER_MENU_SELECTOR = '[data-trigger-menu]'

/**
 * Decide whether a touch-originated mousedown on `target` should be stopped
 * before React's `onMouseDown` (upstream `keepFocus`).
 * @param target - the mousedown event target.
 * @returns true when the target is a composer toolbar button whose keepFocus
 * must be suppressed; false for @ trigger-menu picks, non-buttons, and
 * anything outside the composer capsule.
 */
export function shouldSuppressComposerMousedown(target: Element): boolean {
  const button = target.closest('button')
  if (button === null) return false
  // Only the composer capsule's own buttons: the capsule wraps the editor
  // and the toolbar, so a toolbar button is a descendant of the card.
  if (button.closest(COMPOSER_CARD_SELECTOR) === null) return false
  // The @ candidate menu picks on mousedown — suppressing it breaks touch
  // selection, so its rows and crumbs pass through untouched.
  if (button.closest(TRIGGER_MENU_SELECTOR) !== null) return false
  return true
}

export function installComposerKeyboardTouch(ctx: ClientContext): void {
  installMobileEffect(ctx, 'dsh-maestro-mobile: composer keyboard touch guard', () => {
    if (typeof PointerEvent === 'undefined' && typeof TouchEvent === 'undefined') return undefined

    let touchUntil = 0
    const onTouchActivity = (): void => {
      touchUntil = Date.now() + TOUCH_GRACE_MS
    }
    const onPointerDown = (event: PointerEvent): void => {
      if (event.pointerType === 'touch' || event.pointerType === 'pen') onTouchActivity()
    }
    const onMouseDown = (event: MouseEvent): void => {
      if (Date.now() > touchUntil) return
      const target = event.target
      if (!(target instanceof Element)) return
      if (!shouldSuppressComposerMousedown(target)) return
      // Block React's onMouseDown=keepFocus; the button's click still fires.
      event.stopPropagation()
    }

    window.addEventListener('touchstart', onTouchActivity, { passive: true, capture: true })
    window.addEventListener('touchend', onTouchActivity, { passive: true, capture: true })
    window.addEventListener('pointerdown', onPointerDown, { passive: true, capture: true })
    // Capture phase on document runs before React's root-delegated listener.
    document.addEventListener('mousedown', onMouseDown, true)
    return () => {
      window.removeEventListener('touchstart', onTouchActivity, { capture: true })
      window.removeEventListener('touchend', onTouchActivity, { capture: true })
      window.removeEventListener('pointerdown', onPointerDown, { capture: true })
      document.removeEventListener('mousedown', onMouseDown, true)
    }
  })
}

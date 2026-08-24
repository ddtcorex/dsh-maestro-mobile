import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { installMobileEffect } from './phone-chrome.ts'

/**
 * Touch support for the lineage-count chip ("N subagents") that
 * `dsh-client-ui-subagent` renders in the session-header crumbs.
 *
 * Root cause (upstream, observed live on the served bundle): the count-
 * variant trigger ships without an onClick handler (`onClick:
 * openTitle === void 0 ? void 0 : …`) and drives its card purely through
 * onMouseEnter/onMouseLeave hover timers — enter arms a 150 ms open timer,
 * leave arms a 120 ms close timer, and each cancels the other. On touch
 * devices every tap makes the browser synthesize paired mouseenter/mouseleave
 * from its tracked mouse position, which usually differs from the tap point:
 *
 * - Tap on a closed chip: the trailing synthesized mouseleave cancels the
 *   armed open timer, so the card never appears ("no response after tapping").
 * - Tap anywhere while the card is open: upstream's document pointerdown
 *   listener closes it, but ~200 ms later the browser relocates its synthetic
 *   cursor and fires a fresh mouseenter ONTO the chip, re-arming the open
 *   timer — the card pops back open by itself.
 * - With the emulated cursor parked on the chip no enter/leave pair fires at
 *   all, so repeated taps do literally nothing until some other tap moves the
 *   cursor away. Net effect: flaky "sometimes nothing / sometimes all".
 *
 * Fix strategy, scoped to touch pointers (mouse users keep native hover):
 * 1. Toggle the card ourselves along the component's own keyboard path —
 *    ArrowDown keydown on the trigger opens, Escape closes (both verified
 *    against the live component). React delivers dispatched KeyboardEvents to
 *    onKeyDown like any bubbling event.
 * 2. For a short window after every touch pointer activity, swallow trusted
 *    synthesized mouseover/out/enter/leave events targeting the lineage root
 *    or its body-portaled menu, so upstream hover timers can neither cancel
 *    our toggle nor resurrect a just-closed card. Clicks are never swallowed,
 *    so rows inside the menu keep working.
 */

/** Count-variant trigger only: the switcher variant has its own onClick. */
const CHIP_TRIGGER_SELECTOR =
  '[data-mobile-nav="frame"] button[class*="_trigger"][aria-haspopup="tree"][aria-expanded]:not([class*="_switcherTrigger"])'

/**
 * Lineage root plus its body-portaled menu. NOTE: `ZKlsPq` is the
 * dsh-client-ui-subagent CSS-module hash — audit this selector when the
 * package upgrades.
 */
const HOVER_SUBTREE_SELECTOR = '[class*="ZKlsPq_root"], [class*="ZKlsPq_menu"]'

/** How long after touch activity synthesized hover events stay suppressed. */
const SWALLOW_WINDOW_MS = 800

const SWALLOWED_TYPES = ['mouseover', 'mouseout', 'mouseenter', 'mouseleave'] as const

export function installSubagentChipTouch(ctx: ClientContext): void {
  installMobileEffect(ctx, 'dsh-maestro-mobile: lineage chip touch toggle', () => {
    if (typeof PointerEvent === 'undefined') return undefined

    let swallowUntil = 0
    const armSwallowWindow = (): void => {
      swallowUntil = Date.now() + SWALLOW_WINDOW_MS
    }

    const onPointerUp = (event: PointerEvent): void => {
      armSwallowWindow()
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return
      const target = event.target
      if (!(target instanceof Element)) return
      const trigger = target.closest<HTMLElement>(CHIP_TRIGGER_SELECTOR)
      if (trigger === null) return
      const open = trigger.getAttribute('aria-expanded') === 'true'
      // The component's own keyboard path: navigate() treats ArrowDown as
      // open (+focus first row) and Escape as close-with-focus-restore.
      trigger.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: open ? 'Escape' : 'ArrowDown',
          bubbles: true,
          cancelable: true,
        }),
      )
    }

    const onAnyPointerActivity = (event: PointerEvent): void => {
      armSwallowWindow()
      void event
    }

    const swallowSyntheticHover = (event: MouseEvent): void => {
      if (Date.now() >= swallowUntil) return
      if (!event.isTrusted) return
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest(HOVER_SUBTREE_SELECTOR) === null) return
      event.stopImmediatePropagation()
    }

    document.addEventListener('pointerdown', onAnyPointerActivity, true)
    document.addEventListener('pointerup', onPointerUp, true)
    for (const type of SWALLOWED_TYPES) {
      document.addEventListener(type, swallowSyntheticHover, true)
    }
    return () => {
      document.removeEventListener('pointerdown', onAnyPointerActivity, true)
      document.removeEventListener('pointerup', onPointerUp, true)
      for (const type of SWALLOWED_TYPES) {
        document.removeEventListener(type, swallowSyntheticHover, true)
      }
    }
  })
}

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { createFocusShadow } from './editor-focus-shadow.ts'
import { installMobileEffect } from './phone-chrome.ts'

/**
 * Composer "+" (commands) menu: a second tap must close it.
 *
 * Symptom (phone, DSH 0.1.7-alpha.2): tap "+" → the command menu opens; tap "+"
 * again → the menu stays put (it reads as "opened again").
 *
 * Root cause, read from the installed host build:
 * `@deepseek-ai/dsh-client-ui-input-trigger`'s `toggleSource()` already closes —
 *
 *   if (this.launcher.getSnapshot() === source && this.menu.getSnapshot().open) {
 *     this.dismiss()                 // <- a second tap should land here
 *     return
 *   }
 *   ... open ...
 *
 * but the "+" button's `onClick` (`InputBar.tsx` `onToggleCommandMenu`) first
 * calls `focusDraftEditor(editor, revealSelection)`. Focusing the editor fires
 * an update, which re-enters `controller.track(...)`, whose first two lines are
 *
 *   const launched = this.launcher.getSnapshot() !== null
 *   this.clearLauncher()             // <- launcher is now null
 *   const raw = detectTrigger(draft, caret, guard)
 *   if (raw === null) { if (launched) return; ... }   // menu stays, launcher gone
 *
 * So by the time `toggleSource` runs, `launcher` is `null` and the "already
 * open ⇒ close" branch is unreachable — every tap re-opens. The host's own
 * `aria-expanded` reports the same thing: it reads
 * `useMenuLauncher(s => s === 'command')`, so it stays `false` while the menu is
 * visibly open.
 *
 * Fix (one gap only; the host keeps owning its menu): remember, in the CAPTURE
 * phase of the click, whether the menu was open *before* the host's `onClick`.
 * In the BUBBLE phase — after React's root-delegated listener has run — if the
 * menu is STILL open, the host's close branch was eaten again, so send one
 * `Escape` keydown to the Lexical root. Escape is the host's own close path
 * (editor escape command → `arbitrate('escape')` → reduce close), and it is only
 * honoured on the editor root, not on a menu element. When the menu was closed
 * before the tap (the opening gesture) this effect never intervenes.
 *
 * Menu identity: `MenuView` renders its root with `data-trigger-menu`, a stable
 * marker (unlike the CSS-module hash), and it is exempted from the
 * outside-pointerdown close when the pointer is inside `[data-composer-card]` —
 * which is why the tap cannot close it by itself.
 *
 * The same button has a second phone problem this module owns: the command menu
 * needs no soft keyboard, but that `focusDraftEditor` call raises the IME the
 * tap had just dismissed. Android then slides the composer row up by the
 * keyboard height and the user's second tap lands on the keyboard (measured
 * upstream: visual viewport 754 -> 471 about 170ms after the tap, with the page
 * receiving no DOM event at all). So a tap on "+" releases the editor focus
 * before the click even fires, and the release is repeated at
 * `FOCUS_RELEASE_DELAYS_MS` while the menu is on screen to defeat the host's own
 * late re-focus — cancelled the moment the user touches the editor.
 */

/** The host's "+" button: the composer capsule's own listbox popup trigger. */
export const ADD_BUTTON_SELECTOR = '[data-composer-card] button[aria-haspopup="listbox"]'

/** Command/slash candidate menu root (`ui-input-trigger` MenuView). */
export const TRIGGER_MENU_SELECTOR = '[data-trigger-menu]'

/** Lexical editing surface: Escape is only mapped to a command here. */
export const EDITOR_SELECTOR = '[data-composer-input]'

/**
 * Is this event target (or an ancestor of it) the Lexical editing surface?
 * @param target - the event target.
 * @returns true when the finger landed on the editable area.
 */
export function isEditorSurface(target: Element | null): boolean {
  if (target === null || typeof target.closest !== 'function') return false
  return target.closest(EDITOR_SELECTOR) !== null
}

/**
 * Delays, measured from the tap, at which the editor focus is released again
 * while the command menu is open.
 *
 * The command menu needs no soft keyboard, and the host focuses the editor from
 * the button's `onClick`; on Android that re-raises the IME the tap had just
 * dismissed, the composer row jumps up by the keyboard height, and the user's
 * second tap lands on the keyboard instead of the button (measured upstream:
 * visual viewport 754 -> 471 about 170ms after the tap, with no DOM event
 * reaching the page). Three drops cover the host's own late re-focus without
 * fighting a user who starts typing — any pointerdown on the editor cancels the
 * whole ladder.
 */
export const FOCUS_RELEASE_DELAYS_MS = [120, 320, 640] as const

/**
 * Hard cap on the focus shadow. Every path that arms it also has a normal
 * release (next tap, menu closed, dispose); this is the backstop that makes a
 * stuck shadow impossible - a shadow that outlives the interaction is worse than
 * the keyboard bug it prevents, because the user can no longer focus the editor
 * at all.
 */
export const FOCUS_SHADOW_MAX_MS = 1500

/**
 * Is this event target (or an ancestor of it) the composer "+" button?
 * @param target - the event target.
 * @returns true when the tap belongs to the add button.
 */
export function isComposerAddButton(target: Element | null): boolean {
  if (target === null || typeof target.closest !== 'function') return false
  return target.closest(ADD_BUTTON_SELECTOR) !== null
}

/**
 * A menu node counts as open only while it is laid out. React can keep an
 * unmounted-but-unpainted copy in the tree, and a zero-size box means the user
 * cannot see it.
 * @param box - the node's bounding box, or null when there is none.
 * @param rectCount - `getClientRects().length` for the node.
 * @returns true when the menu is actually on screen.
 */
export function menuIsVisible(
  box: { width: number; height: number } | null,
  rectCount: number,
): boolean {
  if (box === null || rectCount === 0) return false
  return box.width > 0 && box.height > 0
}

/**
 * Should this tap send the closing Escape?
 *
 * Only when the menu was open before the tap AND the host left it open after
 * its own handler ran. The other three combinations are the host doing its job:
 * a first tap (closed before, open after) is the opening gesture, and a tap that
 * ended with the menu closed needs nothing.
 * @param openBeforeTap - menu visible in the capture phase of this click.
 * @param openAfterTap - menu visible in the bubble phase, after React's handler.
 * @returns true when the effect must close the menu itself.
 */
export function shouldCloseCommandMenu(openBeforeTap: boolean, openAfterTap: boolean): boolean {
  return openBeforeTap && openAfterTap
}

/** The visible command menu, or null when none is on screen. */
function openMenu(): Element | null {
  for (const element of document.querySelectorAll(TRIGGER_MENU_SELECTOR)) {
    if (menuIsVisible(element.getBoundingClientRect(), element.getClientRects().length)) return element
  }
  return null
}

/** The Lexical editing surface, or null when this session has none. */
function editorElement(): HTMLElement | null {
  const editor = document.querySelector(EDITOR_SELECTOR)
  return editor instanceof HTMLElement ? editor : null
}

/**
 * Release the editor's DOM focus so the soft keyboard has nothing to attach to.
 * A no-op when the editor is not the active element, so a mouse user who is
 * typing is never disturbed.
 */
function dropEditorFocus(): void {
  const editor = editorElement()
  if (editor !== null && document.activeElement === editor) editor.blur()
}

/**
 * Ask the host to close its own menu. Runs the same path as the user pressing
 * Escape on the editor; a no-op when nothing is open (`arbitrate` answers
 * 'pass'), so re-sending it is safe.
 */
function escapeEditor(): void {
  const editor = document.querySelector(EDITOR_SELECTOR)
  if (!(editor instanceof HTMLElement)) return
  editor.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      keyCode: 27,
      which: 27,
      bubbles: true,
      cancelable: true,
    }),
  )
}

/**
 * Take over the "second tap closes the menu" gap on the composer "+".
 * @param ctx - client root context.
 */
export function installComposerPlusToggle(ctx: ClientContext): void {
  installMobileEffect(ctx, 'dsh-maestro-mobile: composer plus toggle', () => {
    /** Was the menu open when the current click started (capture phase)? */
    let openBeforeClick = false
    /** Pending focus-release timers while the command menu is open. */
    let releaseTimers: number[] = []
    /**
     * Blocks the host's programmatic `editor.focus()` for the length of the
     * "+" interaction. Measured on iOS: a blur after the fact does NOT take the
     * keyboard back, because the keyboard follows DOM focus and is already up
     * by then — the only thing that works is never letting that focus land.
     * See editor-focus-shadow.ts for the never-restored failure mode this
     * helper is built to avoid.
     */
    const shadow = createFocusShadow(() => editorElement())
    /** Hard cap: whatever happens, the shadow lifts. */
    let shadowCap: number | null = null
    /**
     * Watches for the menu leaving the DOM while the shadow is armed. The shadow
     * must lift the moment the interaction is over, and the ladder's ticks are
     * too coarse to guarantee that: a probe (or a fast user) can observe the menu
     * already gone while the next tick is still ~100ms away, and until the shadow
     * lifts the editor cannot be focused at all.
     */
    let menuWatcher: MutationObserver | null = null

    const cancelRelease = (): void => {
      for (const id of releaseTimers) window.clearTimeout(id)
      releaseTimers = []
    }

    const stopMenuWatch = (): void => {
      menuWatcher?.disconnect()
      menuWatcher = null
    }

    const restoreShadow = (): void => {
      if (shadowCap !== null) {
        window.clearTimeout(shadowCap)
        shadowCap = null
      }
      stopMenuWatch()
      shadow.restore()
    }

    /** Restore as soon as the menu is gone (checked per mutation batch). */
    const startMenuWatch = (): void => {
      if (menuWatcher !== null) return
      menuWatcher = new MutationObserver(() => {
        if (openMenu() === null) restoreShadow()
      })
      menuWatcher.observe(document.documentElement, { childList: true, subtree: true })
    }

    const armShadow = (): void => {
      shadow.arm()
      if (shadowCap !== null) window.clearTimeout(shadowCap)
      shadowCap = window.setTimeout(() => {
        shadowCap = null
        shadow.restore()
      }, FOCUS_SHADOW_MAX_MS)
    }

    /**
     * A finger on the editor means "I want to type": every pending release is
     * dropped and the shadow lifts, so focus works again immediately. A finger on
     * the "+" releases the editor and shadows its focus before the browser even
     * synthesizes the click, which is what stops the IME from coming back. Any
     * other tap means the user moved on, so the shadow lifts too — that keeps the
     * override from outliving the interaction (and lets a menu pick restore the
     * caret, which is the host's own focus path).
     */
    const onPointerDown = (event: Event): void => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (isEditorSurface(target)) {
        cancelRelease()
        restoreShadow()
        return
      }
      if (isComposerAddButton(target)) {
        dropEditorFocus()
        armShadow()
        return
      }
      restoreShadow()
    }

    const onClickCapture = (event: Event): void => {
      const onAdd = event.target instanceof Element && isComposerAddButton(event.target)
      openBeforeClick = onAdd && openMenu() !== null
      if (!onAdd) return
      // Capture runs before React's root-delegated onClick, which is where the
      // host focuses the editor. Arming here (and not only on pointerdown) is
      // what makes the keyboard stay down for a click path with no pointerdown
      // at all — a synthetic click, an assistive-technology activation, or a
      // shell that synthesizes the click without a matching pointer sequence.
      dropEditorFocus()
      armShadow()
    }

    const onClickBubble = (event: Event): void => {
      const wasOpen = openBeforeClick
      openBeforeClick = false
      if (!(event.target instanceof Element) || !isComposerAddButton(event.target)) return
      // React's root-delegated onClick has already run: if the menu survived it,
      // the host's close branch lost the launcher and we close it here.
      if (shouldCloseCommandMenu(wasOpen, openMenu() !== null)) escapeEditor()
      // The host re-focuses the editor from that same onClick (now a no-op) and
      // may do it again from a menu effect; keep both defences running while the
      // menu is on screen, and lift the shadow as soon as it is gone.
      cancelRelease()
      if (openMenu() === null) {
        // The tap closed the menu (or never opened one): nothing is left to
        // defend, so give focus back on the next task rather than waiting for the
        // ladder. The editor must be focusable again the moment the interaction
        // is over.
        window.setTimeout(() => {
          if (openMenu() === null) restoreShadow()
        }, 0)
      } else {
        startMenuWatch()
      }
      for (const delay of FOCUS_RELEASE_DELAYS_MS) {
        releaseTimers.push(
          window.setTimeout(() => {
            if (openMenu() !== null) dropEditorFocus()
            else restoreShadow()
          }, delay),
        )
      }
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('click', onClickCapture, true)
    document.addEventListener('click', onClickBubble, false)
    return () => {
      cancelRelease()
      restoreShadow()
      stopMenuWatch()
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('click', onClickCapture, true)
      document.removeEventListener('click', onClickBubble, false)
    }
  })
}

import type { Context as ClientContext } from '@deepseek-ai/cordis'
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

    const cancelRelease = (): void => {
      for (const id of releaseTimers) window.clearTimeout(id)
      releaseTimers = []
    }

    /**
     * A finger on the editor means "I want to type", so every pending release is
     * dropped immediately; a finger on the "+" releases the editor before the
     * browser even synthesizes the click, which is what stops Android from
     * re-raising the just-dismissed IME.
     */
    const onPointerDown = (event: Event): void => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (isEditorSurface(target)) {
        cancelRelease()
        return
      }
      if (isComposerAddButton(target)) dropEditorFocus()
    }

    const onClickCapture = (event: Event): void => {
      openBeforeClick =
        event.target instanceof Element &&
        isComposerAddButton(event.target) &&
        openMenu() !== null
    }

    const onClickBubble = (event: Event): void => {
      const wasOpen = openBeforeClick
      openBeforeClick = false
      if (!(event.target instanceof Element) || !isComposerAddButton(event.target)) return
      // React's root-delegated onClick has already run: if the menu survived it,
      // the host's close branch lost the launcher and we close it here.
      if (shouldCloseCommandMenu(wasOpen, openMenu() !== null)) escapeEditor()
      // The host re-focuses the editor from that same onClick; keep releasing it
      // for as long as the menu is on screen, and let a tap on the editor end
      // the ladder (see onPointerDown).
      cancelRelease()
      for (const delay of FOCUS_RELEASE_DELAYS_MS) {
        releaseTimers.push(
          window.setTimeout(() => {
            if (openMenu() !== null) dropEditorFocus()
          }, delay),
        )
      }
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('click', onClickCapture, true)
    document.addEventListener('click', onClickBubble, false)
    return () => {
      cancelRelease()
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('click', onClickCapture, true)
      document.removeEventListener('click', onClickBubble, false)
    }
  })
}

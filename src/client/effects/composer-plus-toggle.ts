import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { EDITOR_SELECTOR, editorElement } from '../core/composer-dom.ts'
import { createFocusShadow } from './editor-focus-shadow.ts'
import { detectIosWebKit, installMobileEffect } from './phone-chrome.ts'

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
 * receiving no DOM event at all).
 *
 * Two defences, and the ORDER matters for what the user sees:
 *  1. the editor's programmatic `focus` is neutralised for the interaction
 *     (editor-focus-shadow.ts), so the host cannot re-focus at all; and
 *  2. the editor is blurred on the tap — but ONLY while the keyboard is already
 *     hidden.
 *
 * The condition on (2) is the difference between fixing the bug and creating a
 * worse one. Blurring an editor whose keyboard is UP starts the hide animation,
 * and the keyboard is the composer's floor: the whole row slides down under the
 * user's finger while they are still typing (reported on iOS as "the composer
 * jumps on the first tap"). Blurring an editor whose keyboard is already DOWN is
 * the state upstream measured the IME *re-rising* from, and there the blur is
 * what keeps the row still. So: never take the keyboard away from someone who is
 * using it, and never let it come back for someone who is not.
 */

/** The host's "+" button: the composer capsule's own listbox popup trigger. */
export const ADD_BUTTON_SELECTOR = '[data-composer-card] button[aria-haspopup="listbox"]'

/** Command/slash candidate menu root (`ui-input-trigger` MenuView). */
export const TRIGGER_MENU_SELECTOR = '[data-trigger-menu]'

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
 * Shortest life of the focus shadow, measured from the tap that armed it. The
 * window may NOT end with the click: the host focuses the editor again from the
 * effect that runs when its menu opens, which is after this effect's bubble
 * handler has already decided the menu "is not open" (the node is mounted but
 * not yet laid out). The community plugin measured exactly that on a phone -
 *
 *   click / shadow:ON -> shadow:off (its old restore) -> visual viewport
 *   754 -> 471 about 200ms later, when the menu effect focused the editor
 *
 * - and their fix was to stop tying the window to the click. A shadow that lifts
 * before that second focus blocks nothing, which is the reported "tapping + still
 * raises the keyboard". Bounded by FOCUS_SHADOW_MAX_MS; a tap anywhere (and a tap
 * on the editor in particular) still lifts it immediately, so this only ever
 * delays a release nothing is waiting for.
 */
export const FOCUS_SHADOW_MIN_MS = 700

/**
 * Whether the focus shadow must stay armed.
 *
 * Two reasons to hold: the menu is on screen (the host may focus again at any
 * point while it is), and the minimum window has not elapsed (the menu-open
 * effect has not run yet).
 * @param state - menu visibility and how long this interaction has been armed.
 * @returns true when the override must remain in place.
 */
export function shouldHoldShadow(state: { menuOpen: boolean; armedMs: number }): boolean {
  if (state.menuOpen) return true
  return state.armedMs < FOCUS_SHADOW_MIN_MS
}

/**
 * Should a focus that landed on the editor during a live "+" interaction be
 * taken back?
 *
 * Pure so the rule is testable without a browser: the case it exists for cannot
 * be staged in headless Chrome, where the host's own menu-open state leaves the
 * editor unfocusable (measured: a plain div focuses, the editor does not, with
 * this plugin's override deleted). The community plugin validated the technique
 * on a real iPhone instead - a `focusin` blur in a macrotask still let the
 * visual viewport collapse (754 -> 471) while a synchronous one never let the
 * keyboard appear - so the rule is pinned here and the wiring is covered by the
 * interaction's armed window plus the device pass in the upgrade runbook.
 * @param state - interaction, event target and focus state.
 * @returns true when the focus must be released synchronously.
 */
export function shouldTakeBackArmedFocus(state: {
  shadowArmed: boolean
  targetIsEditor: boolean
  editorFocused: boolean
}): boolean {
  if (!state.shadowArmed) return false
  if (!state.targetIsEditor) return false
  return state.editorFocused
}

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

/**
 * Inset, in CSS pixels, above which the visual viewport is treated as shrunk by
 * a soft keyboard. iOS keyboards take ~300px and Android ~250px; an address bar
 * collapsing takes ~60px, so the threshold sits safely between them.
 */
export const KEYBOARD_MIN_INSET_PX = 120

/**
 * Whether the soft keyboard is currently up, read from the visual viewport.
 *
 * Pure and injectable so the decision table is unit-testable without a browser.
 * The zoom guard matters: a pinch shrinks the visual viewport too, and treating
 * that as a keyboard would skip the blur while the user is zoomed.
 * @param viewport - the visual viewport metrics, or null when unsupported.
 * @returns true when a keyboard appears to occupy part of the screen.
 */
export function keyboardIsVisible(
  viewport: { height: number; scale: number } | null,
  innerHeight: number,
): boolean {
  if (viewport === null) return false
  if (viewport.scale > 1.01) return false
  return innerHeight - viewport.height > KEYBOARD_MIN_INSET_PX
}

/**
 * Should the tap release the editor's DOM focus?
 *
 * Only when the editor holds focus AND the keyboard is already hidden: that is
 * the state the IME re-rises from, and the blur is what keeps the composer row
 * still. Blurring while the keyboard is up would start hiding it, which moves the
 * composer under the user's finger — the jump reported on iOS.
 * @param editorFocused - the editor is the active element.
 * @param keyboardVisible - the soft keyboard is up.
 * @returns true when the focus must be released.
 */
export function shouldDropEditorFocus(state: {
  editorFocused: boolean
  keyboardVisible: boolean
  iosViewportPan: boolean
}): boolean {
  if (!state.editorFocused || state.keyboardVisible) return false
  // iOS reacts to a programmatic blur by nudging the visual viewport, which is a
  // 10-20ms up-and-back bounce of the whole composer row - reported from a phone
  // as "it jumps up and drops straight back". There the focus shadow alone is the
  // defence (it stops the host's focus() from landing at all), so the blur is
  // skipped entirely and nothing moves. Android does not pan; there the blur is
  // what stops the IME re-rising into a hidden-keyboard editor, so it stays.
  return !state.iosViewportPan
}

/** The visual viewport metrics, or null where the API is missing. */
function visualViewportMetrics(): { height: number; scale: number } | null {
  const viewport = window.visualViewport
  if (viewport === null || viewport === undefined) return null
  return { height: viewport.height, scale: viewport.scale }
}

/**
 * Release the editor's DOM focus so the soft keyboard has nothing to attach to —
 * unless the keyboard is up, in which case releasing it is what makes the
 * composer jump (see shouldDropEditorFocus).
 */
function dropEditorFocus(iosViewportPan: boolean): void {
  const editor = editorElement()
  if (editor === null) return
  const release = shouldDropEditorFocus({
    editorFocused: document.activeElement === editor,
    keyboardVisible: keyboardIsVisible(visualViewportMetrics(), window.innerHeight),
    iosViewportPan,
  })
  if (release) editor.blur()
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
    /**
     * iOS WebKit responds to a programmatic blur by nudging the visual viewport.
     * Read once per arm: the check is a CSS/UA probe, not a per-tap question.
     */
    const iosViewportPan = detectIosWebKit(
      navigator,
      typeof CSS === 'undefined' ? null : (condition: string) => CSS.supports(condition),
    )
    /** Hard cap: whatever happens, the shadow lifts. */
    let shadowCap: number | null = null
    /** When the current interaction armed the shadow (minimum-window clock). */
    let armedAt = 0
    /**
     * Re-evaluates the hold as the minimum window closes. Without it the shadow
     * would stay armed until the hard cap whenever the menu leaves before the
     * window does - up to 1.5s in which a programmatic focus is still blocked.
     */
    let minTimer: number | null = null
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
      if (minTimer !== null) {
        window.clearTimeout(minTimer)
        minTimer = null
      }
      stopMenuWatch()
      shadow.restore()
      publishShadowState(false)
    }

    /**
     * Lift the shadow only once nothing is left to defend: the menu is off
     * screen AND the minimum window has passed, so the host's menu-open effect
     * (the second focus, ~200ms after the click) has had its chance to land on
     * the override instead of the editor.
     */
    const liftWhenSettled = (): void => {
      const held = shouldHoldShadow({
        menuOpen: openMenu() !== null,
        armedMs: Date.now() - armedAt,
      })
      if (!held) restoreShadow()
    }

    /** Restore as soon as the menu is gone (checked per mutation batch). */
    const startMenuWatch = (): void => {
      if (menuWatcher !== null) return
      menuWatcher = new MutationObserver(() => {
        liftWhenSettled()
      })
      menuWatcher.observe(document.documentElement, { childList: true, subtree: true })
    }

    /**
     * Mirror the shadow's state onto <html>. Cheaper than reaching into the
     * effect from the debug badge, and it makes "was the tap's focus blocked?"
     * readable on a phone screenshot (?dsh-maestro-mobile-debug=1).
     */
    const publishShadowState = (armed: boolean): void => {
      document.documentElement.toggleAttribute('data-mobile-nav-focus-shadow', armed)
    }

    const armShadow = (): void => {
      shadow.arm()
      publishShadowState(shadow.armed)
      armedAt = Date.now()
      if (minTimer !== null) window.clearTimeout(minTimer)
      minTimer = window.setTimeout(() => {
        minTimer = null
        liftWhenSettled()
      }, FOCUS_SHADOW_MIN_MS + 20)
      if (shadowCap !== null) window.clearTimeout(shadowCap)
      shadowCap = window.setTimeout(() => {
        shadowCap = null
        // Through restoreShadow, not shadow.restore(): the marker on <html> is
        // what the composer focus release reads as "this interaction owns the
        // focus", so a cap that only disarmed the element would leave that guard
        // refusing to release for the rest of the session.
        restoreShadow()
      }, FOCUS_SHADOW_MAX_MS)
    }

    /**
     * The shadow only covers `focus()`. If the host reaches the editor another
     * way while the interaction is live, the keyboard is one frame away, and a
     * blur in a macrotask does not take it back - the IME has already started.
     * Blur synchronously, in the capture phase of the focus event itself: the
     * community plugin measured that a `setTimeout` blur still let the visual
     * viewport collapse (754 -> 471) while the synchronous one never let the
     * keyboard appear. Gated on `shadow.armed`, so an editor the user taps to
     * type is never touched - that pointerdown lifts the shadow first.
     */
    const onFocusIn = (event: Event): void => {
      const target = event.target
      const editor = editorElement()
      const takeBack = shouldTakeBackArmedFocus({
        shadowArmed: shadow.armed,
        targetIsEditor: target instanceof Element && target.closest(EDITOR_SELECTOR) !== null,
        editorFocused: editor !== null && document.activeElement === editor,
      })
      if (takeBack && editor !== null) editor.blur()
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
        dropEditorFocus(iosViewportPan)
        armShadow()
        return
      }
      liftWhenSettled()
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
      dropEditorFocus(iosViewportPan)
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
        window.setTimeout(liftWhenSettled, 0)
      } else {
        startMenuWatch()
      }
      for (const delay of FOCUS_RELEASE_DELAYS_MS) {
        releaseTimers.push(
          window.setTimeout(() => {
            if (openMenu() !== null) dropEditorFocus(iosViewportPan)
            else liftWhenSettled()
          }, delay),
        )
      }
    }

    /**
     * Event-order insurance: iOS has historically fired `touchstart` before
     * `pointerdown`, and the host's focus must already be blocked when the tap
     * turns into a click. Arming here is idempotent and the normal release paths
     * (next tap, menu gone, cap, dispose) still apply.
     */
    const onTouchStartAdd = (event: Event): void => {
      const target = event.target
      if (!(target instanceof Element) || !isComposerAddButton(target)) return
      dropEditorFocus(iosViewportPan)
      armShadow()
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('touchstart', onTouchStartAdd, true)
    document.addEventListener('focusin', onFocusIn, true)
    document.addEventListener('click', onClickCapture, true)
    document.addEventListener('click', onClickBubble, false)
    return () => {
      cancelRelease()
      restoreShadow()
      stopMenuWatch()
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('touchstart', onTouchStartAdd, true)
      document.removeEventListener('focusin', onFocusIn, true)
      document.removeEventListener('click', onClickCapture, true)
      document.removeEventListener('click', onClickBubble, false)
    }
  })
}

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { KEYBOARD_MIN_INSET_PX } from './composer-plus-toggle.ts'
import { detectIosWebKit, installMobileEffect } from './phone-chrome.ts'

/**
 * Keep the composer editor from holding DOM focus while the soft keyboard is
 * hidden on iOS.
 *
 * Reported from the phone after the focus shadow landed: tapping the composer
 * "+" STILL raised the keyboard, on the first tap only, with the keyboard
 * already dismissed. The shadow cannot be the whole story, because it only
 * neutralises a `focus()` the host calls - and the tap that raises the keyboard
 * focuses nothing at all. What it does is land on the composer capsule while
 * the editable is still `document.activeElement`: on iOS the soft keyboard
 * follows the FOCUSED EDITABLE, not the focus event, so WebKit re-shows the
 * keyboard for the retained focus. `overlay-menu-tap-guard.ts` documents the
 * same platform fact from the other side (iOS does not move focus onto a tapped
 * button).
 *
 * The evidence is an A/B this plugin already ran on the device, with one
 * variable between the two runs:
 *
 *  - with the on-tap blur (keyboard hidden) the keyboard stayed DOWN and the
 *    phone reported a different bug - a 10-20ms bounce of the composer row,
 *    because a programmatic blur nudges the visual viewport on iOS;
 *  - with that blur removed for iOS (`shouldDropEditorFocus`'s `iosViewportPan`
 *    branch) the bounce went away and the keyboard came back.
 *
 * So the release is the lever, and the bounce is the cost of doing it DURING
 * the tap. This module moves the release off the tap entirely: the editor is
 * released while the keyboard is hidden - when the host focuses it without a
 * user gesture (the unlock effect), when the keyboard goes away, or at the
 * start of any later tap - so by the time a finger lands on the "+" there is no
 * focused editable left to raise the keyboard. Nothing moves under the finger,
 * which is what the tap-time blur could not promise.
 *
 * The release is deliberately conservative: never while the keyboard is up
 * (blurring there is what slides the composer under a typing finger), never
 * while a finger is on the editor (iOS needs ~250ms to show the keyboard and a
 * release in that window would drop it), never while the focus shadow owns the
 * interaction (that IS the tap-time blur), and never while the visual viewport
 * is unreadable (a pinch-zoomed viewport reads as "no keyboard", and blurring a
 * zoomed-in editor the user is typing in is worse than the bug).
 */

/**
 * How long after a finger lands on the editor the release holds off. iOS needs
 * about 250ms to show the keyboard, and the visual viewport does not report it
 * until it is up, so the gap between the tap and the keyboard becoming visible
 * has to be covered by the gesture itself.
 */
export const RELEASE_GESTURE_GRACE_MS = 700

/**
 * Heartbeat that re-checks the invariant. Every trigger here is an event, and
 * the thing being protected is a STATE: measured in the probe, a focus can move
 * onto the editor without a `focusin` reaching a document-level listener at all
 * (headless Chrome suppresses focus events while the document itself is
 * unfocused; Blink sets the active element and dispatches nothing). A retained
 * focus that nothing announced is exactly the one that raises the keyboard, so
 * the state is polled as well - three property reads per tick.
 */
export const RELEASE_HEARTBEAT_MS = 500

/**
 * Largest scroll move treated as the blur's own nudge rather than the user
 * scrolling. iOS nudges the visual viewport by a few pixels; anything this
 * large is a deliberate gesture that must not be undone.
 */
export const NUDGE_MAX_PX = 80

/**
 * How long a keystroke keeps the release away. Reported from the phone as "the
 * keyboard hides by itself": whatever the viewport signals say, a finger that is
 * typing owns the focus, and the gap between two keystrokes must not be enough
 * to take it away.
 */
export const TYPING_QUIET_MS = 1500

/**
 * Marker publishing how many times the editor's focus has been released. The
 * opt-in debug badge reads it, so one phone screenshot answers "did the release
 * run at all" - the question the previous round could not answer.
 */
export const RELEASE_MARKER = 'data-mobile-nav-focus-release'

/** The visual viewport fields the readability check reads. */
export interface ViewportMetrics {
  readonly height: number
  readonly scale: number
}

/**
 * Whether the visual viewport can answer "is a keyboard up?".
 *
 * `keyboardIsVisible` treats a pinch-zoomed viewport as keyboard-free, which is
 * right for the tap-time decision and wrong for a release: it would blur an
 * editor the user has zoomed into and is typing in. Unreadable means "do not
 * act", not "no keyboard".
 * @param viewport - the visual viewport metrics, or null where unsupported.
 * @returns true when the keyboard state can be trusted.
 */
export function keyboardIsReadable(viewport: ViewportMetrics | null): boolean {
  if (viewport === null) return false
  return viewport.scale <= 1.01
}

/**
 * The tallest visual viewport height seen recently: the page with no keyboard.
 *
 * iOS on a page that cannot scroll (the DSH shell is a full-height flex layout
 * with no document scroll) shrinks the LAYOUT viewport with the keyboard, so
 * `innerHeight - visualViewport.height` stays near zero while a keyboard is up
 * and the classic inset reads a keyboard that is right there as absent. The
 * tallest height seen is the baseline that survives that; it heals by itself
 * once a taller reading arrives.
 * @param previous - the baseline so far.
 * @param current - the height just read (0 or less when unreadable).
 * @returns the new baseline.
 */
export function restingViewportHeight(previous: number, current: number): number {
  if (current <= 0) return previous
  return Math.max(previous, current)
}

/** The three heights the keyboard reading can compare. */
export interface KeyboardReading {
  /** `window.innerHeight` (the layout viewport, which iOS shrinks too). */
  readonly innerHeight: number
  /** `visualViewport.height` (0 when the API is missing). */
  readonly viewportHeight: number
  /** The tallest height seen recently. */
  readonly restingHeight: number
}

/**
 * Whether a keyboard appears to occupy part of the screen, from every signal.
 *
 * Either comparison saying "up" is enough: a release that fires while the
 * keyboard is up takes the keyboard away from someone who is typing, which is
 * worse than leaving the retained focus for another moment. An unreadable
 * viewport reads as "might be up" for the same reason.
 * @param reading - the heights to compare.
 * @returns true when the keyboard must be assumed up.
 */
export function keyboardOccupiesScreen(reading: KeyboardReading): boolean {
  if (reading.viewportHeight <= 0) return true
  if (reading.innerHeight - reading.viewportHeight > KEYBOARD_MIN_INSET_PX) return true
  return reading.restingHeight - reading.viewportHeight > KEYBOARD_MIN_INSET_PX
}

/** Everything the release decision reads, injectable for the unit tests. */
export interface ComposerFocusState {
  /** The composer editor is `document.activeElement`. */
  readonly editorFocused: boolean
  /** A keyboard appears to be up (any height signal). */
  readonly keyboardVisible: boolean
  /** The visual viewport can report the keyboard state. */
  readonly keyboardReadable: boolean
  /** A finger landed on the editor within the keyboard-animation window. */
  readonly editorGestureActive: boolean
  /** A keystroke landed in the editor within the typing quiet window. */
  readonly typingActive: boolean
  /** The focus shadow is armed for a "+" interaction. */
  readonly shadowArmed: boolean
}

/**
 * Should this moment release the composer editor's DOM focus?
 * @param state - the current focus, keyboard and interaction state.
 * @returns true when the retained focus must be dropped.
 */
export function shouldReleaseComposerFocus(state: ComposerFocusState): boolean {
  if (!state.editorFocused) return false
  if (state.keyboardVisible) return false
  if (!state.keyboardReadable) return false
  if (state.editorGestureActive) return false
  if (state.typingActive) return false
  return !state.shadowArmed
}

/**
 * Whether a scroll move measured across the blur must be undone.
 *
 * The blur itself nudges the visual viewport on iOS; restoring the scroll in
 * the next frame is what keeps the 10-20ms pan from painting.
 * @param driftPx - `window.scrollY` after the blur minus before it.
 * @param keyboardVisible - the keyboard is up, so the page is moving by design.
 * @returns true when the previous scroll offset must be restored.
 */
export function shouldRestoreScroll(driftPx: number, keyboardVisible: boolean): boolean {
  if (keyboardVisible) return false
  if (driftPx === 0) return false
  return Math.abs(driftPx) <= NUDGE_MAX_PX
}

/** The composer editor, or null when this session has none. */
function editorElement(): HTMLElement | null {
  const editor = document.querySelector('[data-composer-input]')
  return editor instanceof HTMLElement ? editor : null
}

/**
 * Events that mean "a finger is typing in the editor". `beforeinput` covers the
 * input itself, `keydown` covers a key the contenteditable swallows, and
 * `compositionupdate` covers an IME mid-composition (a Vietnamese or Japanese
 * keyboard fires nothing else for a whole syllable).
 */
const TYPING_EVENTS = ['beforeinput', 'input', 'keydown', 'compositionupdate'] as const

/** The visual viewport metrics, or null where the API is missing. */
function viewportMetrics(): ViewportMetrics | null {
  const viewport = window.visualViewport
  if (viewport === null || viewport === undefined) return null
  return { height: viewport.height, scale: viewport.scale }
}

/**
 * Release the composer editor's DOM focus while the keyboard is hidden, on iOS.
 * @param ctx - client root context.
 */
export function installComposerFocusRelease(ctx: ClientContext): void {
  installMobileEffect(ctx, 'dsh-maestro-mobile: composer focus release', () => {
    const cssSupports = typeof CSS === 'undefined' || typeof CSS.supports !== 'function'
      ? null
      : (condition: string): boolean => CSS.supports(condition)
    // iOS only: the platform fact is WebKit's, and Android already keeps the
    // keyboard down through the tap-time blur in composer-plus-toggle.ts.
    if (!detectIosWebKit(navigator, cssSupports)) return undefined

    /** A finger landed on the editor before this timestamp. */
    let gestureUntil = 0
    /** A keystroke landed in the editor before this timestamp. */
    let typingUntil = 0
    /** The tallest visual viewport height seen: the page with no keyboard. */
    let restingHeight = 0
    /** Releases performed, published on <html> for the debug badge. */
    let releases = 0
    let scheduled: number | null = null

    const publish = (): void => {
      document.documentElement.setAttribute(RELEASE_MARKER, String(releases))
    }

    /**
     * Drop the editor's focus and undo the viewport nudge the blur causes.
     *
     * The keyboard is re-read after the blur: if it went up (the user started
     * typing in the same frame) the page is moving for a reason and the scroll
     * must be left alone.
     */
    const release = (): void => {
      const editor = editorElement()
      if (editor === null) return
      const scrollY = window.scrollY
      editor.blur()
      releases += 1
      publish()
      window.requestAnimationFrame(() => {
        const drift = window.scrollY - scrollY
        const metrics = viewportMetrics()
        const visible = keyboardOccupiesScreen({
          innerHeight: window.innerHeight,
          viewportHeight: metrics?.height ?? 0,
          restingHeight,
        })
        if (shouldRestoreScroll(drift, visible)) window.scrollTo(window.scrollX, scrollY)
      })
    }

    const readState = (): ComposerFocusState => {
      const editor = editorElement()
      const metrics = viewportMetrics()
      const viewportHeight = metrics?.height ?? 0
      restingHeight = restingViewportHeight(restingHeight, viewportHeight)
      return {
        editorFocused: editor !== null && document.activeElement === editor,
        keyboardVisible: keyboardOccupiesScreen({
          innerHeight: window.innerHeight,
          viewportHeight,
          restingHeight,
        }),
        keyboardReadable: keyboardIsReadable(metrics),
        editorGestureActive: Date.now() < gestureUntil,
        typingActive: Date.now() < typingUntil,
        shadowArmed: document.documentElement.hasAttribute('data-mobile-nav-focus-shadow'),
      }
    }

    /** Decide on the next frame, never inside the event that asked. */
    const schedule = (): void => {
      if (scheduled !== null) return
      scheduled = window.requestAnimationFrame(() => {
        scheduled = null
        if (shouldReleaseComposerFocus(readState())) release()
      })
    }

    const onFocusIn = (event: Event): void => {
      const target = event.target
      if (!(target instanceof Element) || target.closest('[data-composer-input]') === null) return
      schedule()
    }

    /**
     * Every tap is a chance to catch a retained focus: the "+" arms the shadow
     * synchronously, so by the time this frame runs the release refuses (that is
     * the tap-time blur this module exists to avoid), while a tap anywhere else
     * with the keyboard down is exactly the gesture that would make WebKit show
     * the keyboard for the stale focus.
     */
    const onPointer = (event: Event): void => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-composer-input]') !== null) {
        gestureUntil = Date.now() + RELEASE_GESTURE_GRACE_MS
      }
      schedule()
    }

    /**
     * A tap that reached the click phase is the last chance to catch a focus the
     * other triggers missed - an editor focused before this effect armed (the
     * host's unlock focus runs during boot), or a release that was skipped while
     * a gesture was in flight. Focus already on the editor fires no `focusin`,
     * so nothing else would notice it.
     */
    const onClick = (): void => {
      schedule()
    }

    /**
     * Typing owns the focus. The reported failure of an earlier cut of this
     * effect was "the keyboard hides by itself" while the user was typing: a
     * keystroke cannot be replaced by any viewport reading, so it is tracked
     * directly and the release stays away for the quiet window after it.
     */
    const onEditorInput = (event: Event): void => {
      const target = event.target
      if (!(target instanceof Element) || target.closest('[data-composer-input]') === null) return
      typingUntil = Date.now() + TYPING_QUIET_MS
    }

    /**
     * A rotation changes the height of the page legitimately, and the tallest
     * height seen would otherwise keep reading the landscape page as a keyboard.
     */
    const onOrientation = (): void => {
      restingHeight = 0
      schedule()
    }

    /**
     * The shadow lifts when the "+" interaction ends, which is the first moment
     * a late host focus (or the tap's own blurred state) can be settled again.
     */
    const shadowObserver = new MutationObserver(() => {
      if (!document.documentElement.hasAttribute('data-mobile-nav-focus-shadow')) schedule()
    })

    document.addEventListener('focusin', onFocusIn, true)
    document.addEventListener('pointerdown', onPointer, true)
    document.addEventListener('touchstart', onPointer, true)
    document.addEventListener('click', onClick, true)
    for (const type of TYPING_EVENTS) document.addEventListener(type, onEditorInput, true)
    window.addEventListener('orientationchange', onOrientation)
    shadowObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-mobile-nav-focus-shadow'],
    })
    const viewportTarget: VisualViewport | null = window.visualViewport ?? null
    viewportTarget?.addEventListener('resize', schedule)
    viewportTarget?.addEventListener('scroll', schedule)
    // The state can already exist when this arms: the host focuses the editor
    // from its unlock effect during boot, before this effect is installed, and a
    // focus that never moves fires no `focusin` to catch it later.
    schedule()
    const heartbeat = window.setInterval(schedule, RELEASE_HEARTBEAT_MS)
    return () => {
      window.clearInterval(heartbeat)
      if (scheduled !== null) window.cancelAnimationFrame(scheduled)
      scheduled = null
      shadowObserver.disconnect()
      document.removeEventListener('focusin', onFocusIn, true)
      document.removeEventListener('pointerdown', onPointer, true)
      document.removeEventListener('touchstart', onPointer, true)
      document.removeEventListener('click', onClick, true)
      for (const type of TYPING_EVENTS) document.removeEventListener(type, onEditorInput, true)
      window.removeEventListener('orientationchange', onOrientation)
      viewportTarget?.removeEventListener('resize', schedule)
      viewportTarget?.removeEventListener('scroll', schedule)
      document.documentElement.removeAttribute(RELEASE_MARKER)
    }
  })
}

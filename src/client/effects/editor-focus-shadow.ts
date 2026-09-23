/**
 * Neutralise an editable element's programmatic `focus()` for a short window, so
 * a host handler cannot raise the soft keyboard behind the user's back.
 *
 * Why this exists: on iOS the keyboard follows DOM focus, and `blur()` does not
 * reliably take it back — once the host's `focus()` has run, the keyboard is up
 * and an after-the-fact blur leaves it there. The only thing that works is
 * making that `focus()` a no-op in the first place.
 *
 * Deliberately a tiny, self-healing helper rather than a persistent guard: the
 * known failure mode of this technique is a shadow that is never restored, which
 * blurs or blocks focus forever and leaves the user unable to open the keyboard
 * at all (the community plugin shipped exactly that bug and had to fix it in
 * v3.0.1). So `restore()` is idempotent, always safe to call, and the caller is
 * expected to call it on the next tap, when the menu closes, on a hard cap, and
 * on dispose.
 */

/** The part of a focusable element the shadow needs. */
export interface FocusableLike {
  focus: (...args: never[]) => void
  isConnected?: boolean
}

/** A reversible override of one element's `focus` method. */
export interface FocusShadow {
  /** Whether an element is currently shadowed. */
  readonly armed: boolean
  /** Replace the resolved element's `focus` with a no-op (idempotent). */
  arm(): void
  /** Delete the override so the prototype method is visible again (idempotent). */
  restore(): void
}

/**
 * Build a focus shadow over whatever element `resolve` returns at arm time.
 *
 * The element is re-resolved on every arm because the host can remount the
 * editor; a stale patch on a detached node would silently do nothing.
 * @param resolve - returns the element to shadow, or null when there is none.
 * @returns the shadow controller.
 */
export function createFocusShadow(resolve: () => FocusableLike | null): FocusShadow {
  /** The element carrying our own-property override, or null when disarmed. */
  let patched: FocusableLike | null = null
  const noop = (): void => {}

  const restore = (): void => {
    if (patched === null) return
    const element = patched
    patched = null
    // Delete our own property rather than assigning the captured original back:
    // the native method lives on the prototype, and re-assigning a captured
    // function would pin a stale copy on the node.
    delete (element as { focus?: unknown }).focus
  }

  const arm = (): void => {
    const element = resolve()
    if (element === null) return
    if (patched === element) return
    // A previous editor (remounted while armed) still carries our override.
    restore()
    if (typeof element.focus !== 'function') return
    patched = element
    element.focus = noop as FocusableLike['focus']
  }

  return {
    get armed(): boolean {
      return patched !== null
    },
    arm,
    restore,
  }
}

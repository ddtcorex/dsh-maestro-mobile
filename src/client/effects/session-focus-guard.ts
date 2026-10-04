/**
 * Keep a session switch from raising the soft keyboard on a phone.
 *
 * Why this exists: `dsh-client-ui-conversation`'s InputBar focuses the Lexical
 * editing surface from an effect keyed on `[locked, sessionId, editor]`
 * (`packages/client/ui-conversation/src/client/skeleton/InputBar.tsx:178-182`),
 * so every session switch programmatically focuses the editor. On desktop that
 * is a convenience; on a WebView it hands the engine a DOM focus on a
 * contenteditable, the IME rises, and the user loses half the screen before
 * they can read the history they switched to.
 *
 * This module owns the TRIGGER half of the guard: deriving which session is
 * current, and deciding whether a snapshot transition is a real switch. The
 * in-window suppression lives below in `installSessionFocusGuard`.
 *
 * The foundation source is NOT edited in-tree: the upstream fix belongs in
 * `InputBar` itself (focus on the user's gesture, not on a state change), and
 * this plugin mirrors it on the client side meanwhile — the same posture as
 * `composer-keyboard-touch.ts`.
 *
 * DOM contract: `[data-composer-input]` is the Lexical surface (owned by
 * `core/composer-dom.ts` as EDITOR_SELECTOR). Re-audit when the conversation
 * package upgrades — see docs/upstream/compat-contracts.json.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { EDITOR_SELECTOR, editorElement } from '../core/composer-dom.ts'
import { createFocusShadow } from './editor-focus-shadow.ts'
import { installMobileEffect } from './phone-chrome.ts'

/**
 * How long after a session switch the guard stays armed.
 *
 * Long enough for a slow phone to render and run the host's passive effects,
 * short enough that a user tapping the composer right after the switch rarely
 * lands inside it.
 */
export const FOCUS_GUARD_WINDOW_MS = 800

/**
 * The marker this guard owns, set on the editor element while the window is
 * armed.
 *
 * Deliberately NOT `data-mobile-nav-focus-shadow`: that attribute belongs to
 * `composer-plus-toggle.ts`, lives on `documentElement` rather than the
 * editor, means "the `+` interaction's shadow is armed", and is read by
 * `composer-focus-release.ts`. A shared name would let each guard's
 * arm/restore clobber the other's state.
 */
export const SESSION_GUARD_MARKER = 'data-mobile-nav-session-guard'

/** The slice of a session-list snapshot this module reads. */
export interface SessionSnapshotLike {
  byId: Readonly<Record<string, {
    id?: string
    retainedBy?: { mainView?: number }
  } | undefined>>
}

/**
 * The current session id: the one the main view retains.
 *
 * 0.1.6-alpha.2 dropped `SessionListState.current` in favour of per-session
 * `retainedBy` counters, so this is the host's own selection rule and the one
 * `session-menu.ts` already derives. There is deliberately NO fallback to a
 * `current` string: the package's peer floor is `>=0.1.6-alpha.2`, where that
 * field does not exist, so the branch would be dead code. If the peer floor is
 * ever lowered, revisit this at the same time.
 * @param snapshot - the session-list snapshot.
 * @returns the retained session's id, or undefined when none is retained.
 */
export function currentSessionId(snapshot: SessionSnapshotLike): string | undefined {
  return Object.values(snapshot.byId)
    .find((entry) => (entry?.retainedBy?.mainView ?? 0) > 0)?.id
}

/**
 * Whether a snapshot transition should open the guard window.
 *
 * Only a genuine change of the current session arms. The list store pushes a
 * snapshot for every title edit, reorder and background refresh; arming on
 * those would flash the guard and could swallow a focus the user earned.
 * `undefined !== undefined` is false, so an empty list never arms, while a
 * first-ever session does.
 * @param previous - the current session id at the previous snapshot.
 * @param next - the current session id now.
 * @returns true when the window should open.
 */
export function shouldArmSessionGuard(
  previous: string | undefined,
  next: string | undefined,
): boolean {
  return previous !== next
}

/** Everything the in-window decisions read, injectable for the unit tests. */
export interface GuardWindowState {
  /** The window is currently armed. */
  readonly windowOpen: boolean
  /** The event target is the editor or inside it. */
  readonly targetIsEditor: boolean
  /** The editor is `document.activeElement`. */
  readonly editorFocused: boolean
}

/**
 * Should this in-window pointer event close the guard?
 *
 * `pointerdown` is the phase that PRECEDES the browser's native focus of a tap,
 * so closing here is what keeps a user tap working: by the time the browser
 * focuses the editor, the window is closed and the editor is unshadowed. If the
 * window survived it, that focus would land on a no-op and the user could not
 * open the keyboard at all until the window timed out — the worst failure this
 * guard has.
 * @param state - window, target and focus state.
 * @returns true when the window must close now.
 */
export function shouldCloseWindowOnPointer(state: GuardWindowState): boolean {
  if (!state.windowOpen) return false
  return state.targetIsEditor
}

/**
 * Should this in-window focus be taken back with a synchronous blur?
 *
 * The `editorFocused` term is redundant with `windowOpen` for a user tap and is
 * what makes a user tap safe: a real tap focuses natively, but the pointerdown
 * handler has already closed the window, so `windowOpen` is false by the time
 * this `focusin` arrives. What remains is the host's own focus, which is
 * exactly the case worth suppressing.
 *
 * The blur must be SYNCHRONOUS (the capture phase). A deferred blur is too
 * late: the IME has already started, and a later blur leaves it up.
 * @param state - window, target and focus state.
 * @returns true when the focus must be blurred now.
 */
export function shouldBlurInWindow(state: GuardWindowState): boolean {
  if (!state.windowOpen) return false
  if (!state.targetIsEditor) return false
  return state.editorFocused
}

/**
 * Keep the session-switch autofocus from raising the soft keyboard.
 *
 * Suppression is TWO layers, and the second is not redundant:
 *
 *  1. `focus()` on the editor is shadowed with a no-op own property. A real tap
 *     is unaffected — the browser focuses natively and never routes through
 *     the JS method.
 *  2. Any `focusin` landing on the editor inside the window is blurred
 *     SYNCHRONOUSLY, in the capture phase. This layer exists because the
 *     shadow alone was measured failing on a device: when `InputBar` remounts
 *     for the new session, the host's focus runs inside the commit's
 *     SYNCHRONOUS layout-effect phase — before any MutationObserver microtask —
 *     so the freshly mounted editor was focused while it still had no shadow
 *     (upstream measured `focusin` at t=314ms with the marker absent). A
 *     deferred blur is too late for the same reason: the IME has begun.
 *
 * The window is bounded and self-lifting — timeout, early close on a tap, and
 * disposal. A guard that never lifts is the known failure of this technique
 * (a shadow left in place blocks focus forever); `createFocusShadow`'s
 * idempotent `restore()` is what makes the teardown safe.
 *
 * No iOS gate: the platform fact being relied on is "does this engine raise the
 * IME for DOM focus on a contenteditable", and both iOS and Android WebViews
 * do. Gating on iOS would leave the defect open on Android, where
 * `composer-focus-release.ts` is already skipped entirely.
 * @param ctx - client root context.
 */
export function installSessionFocusGuard(ctx: ClientContext): void {
  installMobileEffect(ctx, 'dsh-maestro-mobile: session focus guard', () => {
    const sessions = ctx.sessions as unknown as {
      list: {
        getSnapshot(): Parameters<typeof currentSessionId>[0]
        subscribe(fn: () => void): () => void
      }
    }
    const shadow = createFocusShadow(() => editorElement())
    // Snapshot at install: subscribing must not arm the window by itself, only
    // a CHANGE of the current session may.
    let lastSessionId = currentSessionId(sessions.list.getSnapshot())
    let windowTimer = 0
    let windowOpen = false

    /**
     * Close the window and undo everything it did.
     *
     * The marker is swept from the live document rather than from a tracked
     * list on purpose: a tracked Set would retain editors the host has already
     * unmounted, and a retained reference is how a `focus` override ends up
     * stranded on a detached node. This sweep re-derives from the DOM, so it
     * cannot leak. It runs at most a few times per session switch.
     */
    const restore = (): void => {
      window.clearTimeout(windowTimer)
      windowTimer = 0
      windowOpen = false
      shadow.restore()
      for (const el of document.querySelectorAll(`[${SESSION_GUARD_MARKER}]`)) {
        el.removeAttribute(SESSION_GUARD_MARKER)
      }
    }

    /** Open the window on the editor currently in the document. */
    const arm = (): void => {
      restore()
      windowOpen = true
      const editor = editorElement()
      if (editor !== null) {
        shadow.arm()
        editor.setAttribute(SESSION_GUARD_MARKER, '')
      }
      windowTimer = window.setTimeout(restore, FOCUS_GUARD_WINDOW_MS)
    }

    /**
     * A remount inside the window needs a fresh shadow: the editor is
     * Session-owned, so a switch can replace the element this module resolved
     * at arm time, and the host focuses it before this microtask can react.
     */
    const observer = new MutationObserver(() => {
      if (!windowOpen) return
      const editor = editorElement()
      if (editor === null) return
      shadow.arm()
      editor.setAttribute(SESSION_GUARD_MARKER, '')
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })

    /**
     * A finger on the editing surface is the user saying "I want to type":
     * close the window on the spot so the browser's native focus of that tap
     * finds an unshadowed editor.
     */
    const onPointerDown = (event: Event): void => {
      const target = event.target
      const close = shouldCloseWindowOnPointer({
        windowOpen,
        targetIsEditor: target instanceof Element && target.closest(EDITOR_SELECTOR) !== null,
        editorFocused: false,
      })
      if (close) restore()
    }

    /** Timing fallback for the window's whole lifetime. */
    const onFocusIn = (event: Event): void => {
      const target = event.target
      const editor = editorElement()
      const take = shouldBlurInWindow({
        windowOpen,
        targetIsEditor: target instanceof Element && target.closest(EDITOR_SELECTOR) !== null,
        editorFocused: editor !== null && document.activeElement === editor,
      })
      if (take && editor !== null) editor.blur()
    }

    // Both listeners live for the whole window, not just while it is armed:
    // they are how the window is closed early and how a focus that slipped
    // past the shadow is taken back. Attaching them HERE is the pair the
    // disposer below removes — an add/remove asymmetry is silent at runtime
    // (the handlers simply never run), and it disabled both suppression
    // layers once already. Symmetry is pinned by a unit test.
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('focusin', onFocusIn, true)

    const unsubscribe = sessions.list.subscribe(() => {
      const next = currentSessionId(sessions.list.getSnapshot())
      if (!shouldArmSessionGuard(lastSessionId, next)) return
      lastSessionId = next
      arm()
    })

    return () => {
      unsubscribe()
      observer.disconnect()
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('focusin', onFocusIn, true)
      restore()
    }
  })
}

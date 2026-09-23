import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ReconcilerTask } from '../core/reconciler-core.ts'
import { installMobileEffect } from './phone-chrome.ts'

/**
 * Sidebar panel exit: a way back to the conversation.
 *
 * A global sidebar panel ("Plugins", "Skills", ...) REPLACES the conversation
 * (`ctx.layout.selectPanel(id)`), and the host ships no way out of one:
 * `PanelRow`'s onClick is a bare `selectPanel(id)` — tapping the already
 * selected row selects it again — and the host's only `selectPanel(null)`
 * caller is its own workspace replacement. On a phone the drawer entry that
 * opened the panel is the only control that leaves, and the header (with the
 * drawer toggle) is not rendered at all while a panel owns the main column.
 *
 * Three exits, roughly in the order a phone user reaches for them:
 *  1. the system back key / back gesture (a `popstate` entry armed while a panel
 *     is open) — `createPanelExit(...).task`, driven by the shared reconciler;
 *  2. tapping the already-selected panel row again — `installPanelRowExit`;
 *  3. the shell FAB, which reads as "back to conversation" while a panel owns
 *     the main column — see `fabMode` in panel-presence.ts and ShellOverlay.
 *
 * All three call the same `exit`, so they cannot drift apart.
 */

/** The host's panel row buttons (`SidebarRoot.tsx` `css.panelRow`). */
export const PANEL_ROW_SELECTOR = '[class*="panelRow"]'

/**
 * The SELECTED panel row. The host sets `aria-current="page"` on the selected
 * row only (measured on 0.1.7-alpha.2), which is what separates "re-tap the row
 * I am on" from "open a different panel".
 */
export const PANEL_ROW_ACTIVE_SELECTOR = '[class*="panelRow"][aria-current="page"]'

/**
 * Safety net for the in-flight guard: cleared as soon as the panel row is gone,
 * and never later than this.
 */
const PANEL_EXIT_FALLBACK_MS = 1500

/** Timeout that eats our own `history.back()` echo, so it is not read as a user back press. */
const SELF_BACK_ECHO_MS = 1200

/** Whether a panel currently owns the main column (DOM truth, no in-flight window). */
export function panelOwnsMainArea(): boolean {
  return document.querySelector(PANEL_ROW_ACTIVE_SELECTOR) !== null
}

/**
 * Is this event target inside the selected panel row?
 * @param target - the click target.
 * @returns true when the tap would re-select the panel already on screen.
 */
export function isActivePanelRow(target: Element | null): boolean {
  if (target === null || typeof target.closest !== 'function') return false
  const row = target.closest(PANEL_ROW_SELECTOR)
  return row !== null && row.getAttribute('aria-current') === 'page'
}

/**
 * The host's `selectPanel(null)` call, or null when this host cannot select
 * panels at all.
 *
 * Probed rather than assumed: the layout face is capability-checked so the
 * feature goes inert on a host generation without it instead of throwing at
 * call time. The receiver is bound, because `selectPanel` is a service method
 * that reads its own state.
 * @param layout - the client `ctx.layout` face.
 * @returns a zero-argument "leave the panel" call, or null.
 */
export function panelSelectorOf(layout: unknown): (() => void) | null {
  const face = layout as { selectPanel?: unknown } | null | undefined
  if (face === null || face === undefined || typeof face.selectPanel !== 'function') return null
  const select = (face.selectPanel as (panelId: null) => void).bind(face)
  return () => select(null)
}

/**
 * Should the back entry be armed now?
 * @param panelViewOpen - a panel owns the main column and no exit is in flight.
 * @param armed - whether an entry is already armed.
 * @returns true when exactly one entry must be pushed.
 */
export function shouldArmBackEntry(panelViewOpen: boolean, armed: boolean): boolean {
  return panelViewOpen && !armed
}

/**
 * Should the armed back entry be given back? True when the panel left by another
 * route (the FAB or a re-tap), which would otherwise leave a stray history entry
 * that swallows the user's next back press.
 * @param panelViewOpen - a panel owns the main column and no exit is in flight.
 * @param armed - whether an entry is currently armed.
 * @returns true when the entry must be popped programmatically.
 */
export function shouldReleaseBackEntry(panelViewOpen: boolean, armed: boolean): boolean {
  return !panelViewOpen && armed
}

/** The shared panel-exit face: one action, three entry points. */
export interface PanelExit {
  /** Leave the panel (no-op while an exit is already in flight). */
  exit: () => void
  /** Whether this host can select panels; false makes every route inert. */
  supported: boolean
  /** Whether a panel owns the main column (DOM truth; the FAB reads this). */
  panelOpen: () => boolean
  /** The reconciler task that owns the system-back route. */
  task: ReconcilerTask
}

/**
 * Build the shared exit action and its system-back task.
 * @param layout - the client `ctx.layout` face (probed, never assumed).
 * @returns the exit face; every route funnels through `exit`.
 */
export function createPanelExit(layout: unknown): PanelExit {
  const select = panelSelectorOf(layout)
  const supported = select !== null

  /**
   * True from the moment an exit starts until React has committed the swap.
   * During that window the panel row STILL carries `aria-current="page"`, so
   * history bookkeeping must treat the panel as closed or it arms a second
   * entry while the first exit is still in flight.
   */
  let leaving = false
  let fallbackTimer: number | null = null

  let listening = false
  let armed = false
  let selfBackPending = false
  let selfBackTimer: number | null = null

  const clearFallback = (): void => {
    if (fallbackTimer !== null) window.clearTimeout(fallbackTimer)
    fallbackTimer = null
  }

  const clearSelfBack = (): void => {
    selfBackPending = false
    if (selfBackTimer !== null) window.clearTimeout(selfBackTimer)
    selfBackTimer = null
  }

  const panelOpen = (): boolean => panelOwnsMainArea()

  /** A panel owns the main column, counting the in-flight exit as already gone. */
  const panelViewOpen = (): boolean => !leaving && panelOpen()

  /** Leave the in-flight window once the panel row is really gone (or the net fires). */
  const settle = (): void => {
    if (!leaving) return
    if (!panelOpen()) {
      leaving = false
      clearFallback()
    }
  }

  const exit = (): void => {
    if (select === null || leaving) return
    leaving = true
    // Deliberately not delayed behind an animation: the commit remounts the
    // whole conversation, and holding the panel on screen through it would show
    // a blank column for that entire window.
    select()
    clearFallback()
    fallbackTimer = window.setTimeout(() => {
      fallbackTimer = null
      leaving = false
    }, PANEL_EXIT_FALLBACK_MS)
  }

  /**
   * Our own `history.back()` echoes back as a popstate; swallow that echo (with
   * a timeout, so an engine that never emits it cannot leave the flag stuck and
   * eat the user's next real back press).
   */
  const goBack = (): void => {
    selfBackPending = true
    if (selfBackTimer !== null) window.clearTimeout(selfBackTimer)
    selfBackTimer = window.setTimeout(clearSelfBack, SELF_BACK_ECHO_MS)
    try {
      history.back()
    } catch {
      clearSelfBack()
    }
  }

  const onPopState = (): void => {
    if (selfBackPending) {
      clearSelfBack()
      return
    }
    if (!armed) return
    armed = false
    if (panelViewOpen()) exit()
  }

  const task: ReconcilerTask = {
    name: 'panel-back-exit',
    scopes: ['*'],
    ensure: (): void => {
      settle()
      if (!supported) return
      if (!listening) {
        window.addEventListener('popstate', onPopState)
        listening = true
      }
      if (shouldArmBackEntry(panelViewOpen(), armed)) {
        armed = true
        try {
          // Second argument empty: add a poppable entry without touching the URL.
          history.pushState({ mobilePanelExit: true }, '')
        } catch {
          // A sandboxed frame refuses pushState: give up on this route rather
          // than break anything else.
          armed = false
        }
        return
      }
      if (shouldReleaseBackEntry(panelViewOpen(), armed)) {
        armed = false
        goBack()
      }
    },
    dispose: (): void => {
      if (listening) {
        window.removeEventListener('popstate', onPopState)
        listening = false
      }
      clearSelfBack()
      clearFallback()
      if (armed) {
        armed = false
        goBack()
      }
    },
  }

  return { exit, supported, panelOpen, task }
}

/**
 * Tapping the already-selected panel row returns to the conversation.
 * Unselected rows are left alone — they still go through the host's own
 * `selectPanel(id)`.
 *
 * The capture phase is what lets this run before the host's React `onClick`; the
 * drawer's own close handler also listens in the capture phase on `document`,
 * and `stopPropagation` (not `stopImmediatePropagation`) leaves it running, so
 * the drawer still collapses on the same tap.
 * @param ctx - client root context.
 * @param exitPanel - the shared exit action.
 */
export function installPanelRowExit(ctx: ClientContext, exitPanel: () => void): void {
  installMobileEffect(ctx, 'dsh-maestro-mobile: panel row returns to conversation', () => {
    const onClick = (event: MouseEvent): void => {
      if (!(event.target instanceof Element) || !isActivePanelRow(event.target)) return
      event.preventDefault()
      event.stopPropagation()
      exitPanel()
    }
    document.addEventListener('click', onClick, true)
    return () => {
      document.removeEventListener('click', onClick, true)
    }
  })
}

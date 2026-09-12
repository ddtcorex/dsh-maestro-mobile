import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { createReconcilerCore } from '../core/reconciler-core.ts'
import type { ReconcilerTask } from '../core/reconciler-core.ts'
import { createPreviewCloseTask, createSheetRiseTask } from './aionui-compat.ts'
import { createStatsLineTask } from './stats-line.ts'
import { createPreviewFullscreenTask } from './preview-fullscreen.ts'
import { createGitChipTask } from './git-chip-reparent.ts'
import { createSettingsToolbarTask } from './settings-toolbar-reparent.ts'
import { createJobsIndicatorTask } from './jobs-indicator.ts'
import { consumeIfGestured, isStrokeLocked } from './gesture-guard.ts'

// The custom client bundler cannot resolve `../` requires from src/client/effects,
// so this mirrors the namespace id from src/client/locales.ts. Keep in sync.
const NS = 'mobileNav'

/** Same width bound as the shell's SIDEBAR_AUTO_COLLAPSE (viewport < 1024),
 *  ANDed with a touch-primary pointer guard. Width alone cannot tell a phone
 *  from a desktop window: split views and OS display scaling push a PC's CSS
 *  viewport below 1024px too, and the whole mobile shell (drawer, header
 *  toggle, gestures) would mount there. (pointer: coarse) keeps the
 *  adaptation on touch-primary devices while any mouse-driven window stays
 *  desktop at every width.
 *
 *  Probe consequence: headless Chrome reports (pointer: none) — not coarse —
 *  unless touch emulation is enabled, so a CDP probe must call
 *  Emulation.setTouchEmulationEnabled (or set hasTouch) before asserting any
 *  mobile UI, or every assertion silently becomes a desktop assertion. */
export const MOBILE_QUERY = '(max-width: 1023px) and (pointer: coarse)'

/** Desktop no-op boundary, kept next to the mobile query for one source of truth.
 *  Informational only: the authoritative desktop guard is the complement media
 *  query in styles/misc.css.ts, because slot-rendered controls exist at every
 *  width. */
export const DESKTOP_QUERY = '(min-width: 1024px)'

/** Pointer-only guard for the features that have no desktop equivalent
 *  (session-menu deletion and friends): armed on touch-primary devices at
 *  EVERY width, so a large tablet in landscape keeps the desktop layout but
 *  still gets them. Mouse-driven or pointer-less windows never arm. */
export const TOUCH_QUERY = '(pointer: coarse)'

/**
 * Re-arm a mobile-only DOM effect on every query change. Replaces the
 * repeated matchMedia + change-listener scaffold so all breakpoint strings
 * live in one place. `query` defaults to MOBILE_QUERY; an effect that arms on
 * a different condition passes its own string instead of building a private
 * matchMedia scaffold.
 */
export function installMobileEffect(
  ctx: ClientContext,
  label: string,
  install: (narrow: MediaQueryList) => (() => void) | undefined,
  query: string = MOBILE_QUERY,
): void {
  ctx.effect(() => {
    const narrow = window.matchMedia(query)
    let cleanup: (() => void) | undefined
    const arm = (): void => {
      cleanup?.()
      cleanup = narrow.matches ? install(narrow) : undefined
    }
    arm()
    narrow.addEventListener('change', arm)
    return () => {
      narrow.removeEventListener('change', arm)
      cleanup?.()
    }
  }, label)
}

/** The AppFrame element: direct parent of the shell overlay layer. */
export function findFrame(): HTMLElement | null {
  return document.querySelector('[data-shell-overlay]')?.parentElement ?? null
}

/** Resolve the plugin-owned frame marker, falling back to the raw shell frame. */
export function getFrame(): HTMLElement | null {
  return document.querySelector('[data-mobile-nav="frame"]') ?? findFrame()
}

/**
 * Frame marker controller: owns `data-mobile-nav="frame"` and every plugin
 * marker that can survive on the shell-owned frame. Installed once at apply
 * time so effects no longer each need to find/set/clear the frame. Returns a
 * disposer that unregisters the task and resets the installed flag, so a
 * same-environment plugin reload can rebuild the reconciler from scratch.
 */
export function installFrameController(): () => void {
  if (frameControllerInstalled) return () => {}
  frameControllerInstalled = true
  let frame: HTMLElement | null = null
  const narrow = window.matchMedia(MOBILE_QUERY)
  const clearMarker = (el: HTMLElement | null): void => {
    if (el === null) return
    el.removeAttribute('data-mobile-nav')
    el.removeAttribute('data-mobile-preview-full')
    el.removeAttribute('data-aionui-explorer-open')
    el.removeAttribute('data-aionui-preview-open')
  }
  const removeTask = addReconcilerTask({
    name: 'frame-marker',
    scopes: ['*'],
    ensure: () => {
      if (!narrow.matches) {
        // Desktop: the plugin is a complete no-op — never leave the marker.
        clearMarker(frame ?? findFrame())
        frame = null
        return
      }
      frame = findFrame()
      if (frame !== null && !frame.hasAttribute('data-mobile-nav')) {
        frame.setAttribute('data-mobile-nav', 'frame')
      }
    },
    dispose: () => {
      clearMarker(frame)
      frame = null
    },
  })
  // Width crossing does not always mutate the DOM enough to retrigger the
  // reconciler, so re-apply the narrow/wide rule deterministically here.
  const onChange = (): void => {
    if (!narrow.matches) {
      clearMarker(frame ?? findFrame())
      frame = null
    }
  }
  narrow.addEventListener('change', onChange)
  return () => {
    narrow.removeEventListener('change', onChange)
    removeTask()
    frameControllerInstalled = false
  }
}

/**
 * One unit of DOM reconciliation driven by the shared full-tree observer.
 * Defined in the DOM-free core so registration / dirty routing / coalescing
 * are unit-testable; kept reachable from here so the third-party task modules
 * (aionui-compat, stats-line) keep importing it via `./phone-chrome.ts`.
 */
export type { ReconcilerTask } from '../core/reconciler-core.ts'

let frameControllerInstalled = false
let reconcileTasksRegistered = false
let reconcilerInstalled = false

// The DOM-free core owns the task registry, dirty-key routing, and coalesced
// flush scheduling; this module is the thin browser adapter that feeds it
// MutationObserver records and drives its lifecycle from the mobile effect.
const core = createReconcilerCore({
  requestFrame: (flush) => {
    let id = 0
    const run = (): void => {
      id = 0
      flush()
    }
    id = requestAnimationFrame(run)
    return () => {
      if (id !== 0) cancelAnimationFrame(id)
    }
  },
})

/**
 * One full-tree MutationObserver for every mobile DOM reconciler. Tasks can be
 * registered from React or plain effects; they only run while the mobile
 * breakpoint is active and are re-armed automatically on width changes.
 */
export function installReconciler(ctx: ClientContext): () => void {
  if (reconcilerInstalled) return () => {}
  reconcilerInstalled = true
  installMobileEffect(ctx, 'dsh-maestro-mobile: DOM reconciler', () => {
    // Coalesce every mutation burst (typing, animations, per-token TPS
    // re-renders) into one dirty-key pass per animation frame. Each task
    // declares scopes so only intersecting tasks run on a given flush.
    const observer = new MutationObserver((records) => {
      const keys = new Set<string>()
      for (const record of records) {
        keys.add(
          record.type === 'attributes' && record.attributeName !== null ? record.attributeName : '*',
        )
      }
      core.note(keys)
    })
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        'style',
        'class',
        'data-phase',
        'data-sidebar-collapsed',
        'data-aionui-explorer-open',
        'data-aionui-preview-open',
        'data-mobile-preview-full',
      ],
    })
    core.activate()
    return () => {
      observer.disconnect()
      core.deactivate()
    }
  })
  return () => {
    reconcilerInstalled = false
  }
}

/**
 * Whether the page runs on iOS / iPadOS WebKit, where focusing a text field
 * whose computed font-size is below 16px zooms the whole visual viewport.
 * Every other engine ignores field font-size, so the 16px floor in
 * styles/misc.css.ts is gated on this marker instead of applying to every
 * phone — Android would only get bigger fields for no benefit.
 *
 * Pure and injectable so the decision table is unit-testable:
 * - The feature probe is the reliable signal: `font: -apple-system-body` is
 *   Safari-only and `-webkit-touch-callout` is an iOS property, so the pair is
 *   true on iOS WebKit (including Chrome / Edge / Opera on iOS, which are
 *   WebKit and zoom identically) and false on Chromium and on macOS Safari.
 * - The UA fallback covers engines whose CSS.supports is missing or which
 *   parse the probe differently: iPhone / iPad / iPod UAs, plus iPadOS 13+
 *   which reports a Macintosh UA and is told apart by its touch points.
 * @param nav - the navigator fields the decision reads.
 * @param supports - `CSS.supports`, or null when unavailable.
 * @returns true when the page must hold every text field at >= 16px.
 */
export function detectIosWebKit(
  nav: { userAgent: string; maxTouchPoints: number },
  supports: ((condition: string) => boolean) | null,
): boolean {
  if (supports !== null) {
    try {
      if (supports('(font: -apple-system-body) and (-webkit-touch-callout: none)')) return true
    } catch {
      // A UA that rejects the condition string falls through to the UA test.
    }
  }
  const ua = nav.userAgent
  if (/iP(hone|ad|od)/.test(ua)) return true
  return /Macintosh/.test(ua) && nav.maxTouchPoints > 1
}

/** Marker the iOS-only zoom-guard CSS is scoped to (set on documentElement). */
export const IOS_MARKER = 'data-mobile-nav-ios'

/** Register a reconciler task. The returned disposer removes it immediately. */
export function addReconcilerTask(task: ReconcilerTask): () => void {
  return core.register(task)
}

/**
 * Viewport content the plugin owns while the mobile branch is armed.
 * Deliberately zoom-free: iOS 10+ ignores maximum-scale/user-scalable for user
 * pinch but other engines honour them, so writing them would only take zoom
 * away from Android; the iOS focus-zoom fix is the >=16px field floor
 * (data-mobile-nav-ios), not a zoom ban.
 */
export const VIEWPORT_CONTENT = 'width=device-width, initial-scale=1, viewport-fit=cover'

/**
 * The viewport content the plugin writes, for any host value observed at arm
 * time. Pure so the "no zoom tokens" rule is testable without a DOM.
 * @param existing - the host's own viewport content (unused today; kept in the
 * signature so a future host token that must be carried forward has one place
 * to live).
 * @returns the plugin-owned content.
 */
export function viewportContentFor(existing: string): string {
  void existing
  return VIEWPORT_CONTENT
}

const findViewportMeta = (): HTMLMetaElement | null =>
  document.querySelector<HTMLMetaElement>('meta[name="viewport"]')

/**
 * Phone chrome: KEEP the system status bar (no fullscreen) and make it
 * blend into the page. On narrow screens:
 * - The viewport meta is OWNED by the plugin while armed:
 *   width=device-width, initial-scale=1, viewport-fit=cover, re-asserted on
 *   every host rewrite, node replacement, or late injection, so
 *   env(safe-area-inset-top) stays the real status-bar / notch height instead
 *   of silently going stale when the host touches the meta.
 * - A theme-color meta tracks the shell background (the official theme is
 *   toggled by body[data-ds-dark-theme], which flips --dsw-alias-bg-base):
 *   Android then paints the status bar / URL bar with the page's own base
 *   color, so the status bar reads as part of the UI instead of a foreign
 *   strip. The drawer paints the same strip on iOS / notch displays.
 * - gesturestart is suppressed as the legacy-iOS fallback for double-tap
 *   zoom; modern browsers are covered by the stylesheet's
 *   touch-action: manipulation (which keeps pan and pinch zoom).
 */
export function installPhoneChrome(ctx: ClientContext): void {
  installMobileEffect(ctx, 'dsh-maestro-mobile: status bar theme + viewport + zoom guard', () => {
    const themeMeta = document.createElement('meta')
    themeMeta.name = 'theme-color'
    const bodyBg = (): string => getComputedStyle(document.body).backgroundColor
    let originalViewport: string | null = null
    let observedMeta: HTMLMetaElement | null = null
    // Our own write retriggers the observers; the equality check in
    // assertViewport turns that pass into a no-op, and `applying` guards the
    // write itself against re-entrant observer callbacks on exotic engines.
    let applying = false

    // The plugin owns the meta while armed, so a host rewrite, a node
    // replacement, or a meta that arrives after this effect arms cannot
    // silently drop viewport-fit=cover; attachMetaObserver re-binds to the
    // current node so a replacement keeps being watched.
    const assertViewport = (): void => {
      const viewport = findViewportMeta()
      if (viewport === null) return
      if (originalViewport === null) originalViewport = viewport.content
      if (applying || viewport.content === VIEWPORT_CONTENT) return
      applying = true
      viewport.content = viewportContentFor(viewport.content)
      applying = false
    }
    const metaObserver = new MutationObserver(assertViewport)
    const attachMetaObserver = (): void => {
      const viewport = findViewportMeta()
      if (viewport === observedMeta) return
      if (observedMeta !== null) metaObserver.disconnect()
      observedMeta = viewport
      if (viewport !== null) {
        metaObserver.observe(viewport, { attributes: true, attributeFilter: ['content'] })
      }
    }
    const headObserver = new MutationObserver((): void => {
      attachMetaObserver()
      assertViewport()
    })
    headObserver.observe(document.head, { childList: true })
    attachMetaObserver()
    assertViewport()

    const observer = new MutationObserver(() => {
      themeMeta.content = bodyBg()
    })
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
    const onGestureStart = (event: Event) => event.preventDefault()
    document.addEventListener('gesturestart', onGestureStart)
    // iOS WebKit zooms the viewport when a field below 16px takes focus; the
    // marker gates the 16px floor in styles/misc.css.ts to that engine only.
    const cssSupports = typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
      ? (condition: string): boolean => CSS.supports(condition)
      : null
    if (detectIosWebKit(navigator, cssSupports)) {
      document.documentElement.setAttribute(IOS_MARKER, '')
    }
    themeMeta.content = bodyBg()
    if (themeMeta.parentElement === null) document.head.appendChild(themeMeta)
    return () => {
      metaObserver.disconnect()
      headObserver.disconnect()
      observer.disconnect()
      document.removeEventListener('gesturestart', onGestureStart)
      const viewport = findViewportMeta()
      // Hand the meta back only if it still holds OUR content; a host value
      // written while we were armed wins on dispose.
      if (viewport !== null && originalViewport !== null && viewport.content === VIEWPORT_CONTENT) {
        viewport.content = originalViewport
      }
      themeMeta.remove()
      document.documentElement.removeAttribute(IOS_MARKER)
    }
  })
}





/**
 * Drawer close interactions that are plain event listeners, not DOM
 * reconciliation:
 * - Escape closes the drawer (yielding to any open modal dialog, which owns
 *   its own Escape handling).
 * - Tapping a navigation target inside the drawer (session row, task board /
 *   ssh takeover entries, search results) closes the drawer so the content
 *   it opened gets the whole screen. Session-row action buttons (kebab) are
 *   excluded — they open a menu that must survive the tap.
 */
export function installOverlayInteractions(ctx: ClientContext): void {
  installMobileEffect(ctx, 'dsh-maestro-mobile: drawer close (Escape + navigate)', () => {
    const toggleSidebar = (): void => ctx.layout.toggleSidebar()
    const drawerOpen = (): boolean => {
      const frame = getFrame()
      return frame !== null && !frame.hasAttribute('data-sidebar-collapsed')
    }
    const closeDrawer = (): void => {
      toggleSidebar()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (document.querySelector('[aria-modal="true"]') !== null) return
      if (drawerOpen()) toggleSidebar()
    }
    // Capture phase: run before the shell or a plugin processes the click,
    // so takeover panels never render under the open drawer.
    const drawerRoot = (): HTMLElement | null =>
      document.querySelector<HTMLElement>('[data-mobile-nav="frame"] > :first-child')

    const shouldCloseOnTapInsideDrawer = (target: EventTarget | null): boolean => {
      if (document.querySelector('[aria-modal="true"]') !== null) return false
      if (!drawerOpen()) return false
      if (!(target instanceof Element)) return false
      const drawer = drawerRoot()
      if (drawer === null || !drawer.contains(target)) return false
      if (target.closest('[class*="sessionRow"] button') !== null) return false
      return target.closest(
        'button[data-dsh-taskboard-entry], button[data-dsh-ssh-entry], [class*="newSession"], [class*="sessionRow"], [class*="searchResultRow"], [class*="searchResultWorkspace"]',
      ) !== null
    }
    // Touch path for session/search rows: never close the drawer from pointer
    // events. Closing at pointerup (or deferring the close) races the browser's
    // synthesized click; some iOS shells suppress that click entirely, so the
    // row's onClick never runs. Instead arm the drawer to close on the *fact*
    // of navigation: when the selected row's title changes, React has already
    // opened the conversation, so the drawer can close safely.
    // Ported from mexiaosqwq/dsh-web-mobile v2.2.0 (#32).
    let lastTouchNavAt = 0
    let navSignatureAtArm = ''
    let navObserver: MutationObserver | null = null
    let navTimer: number | null = null

    const selectedRowSignature = (): string | null => {
      const selected = drawerRoot()?.querySelector<HTMLElement>('[role="treeitem"][aria-selected="true"]')
      const title = selected?.querySelector<HTMLElement>('[class*="_title"]')
      return title?.textContent?.trim() ?? null
    }

    const disarmNav = (): void => {
      navObserver?.disconnect()
      navObserver = null
      if (navTimer !== null) window.clearTimeout(navTimer)
      navTimer = null
      navSignatureAtArm = ''
    }

    const armNav = (): void => {
      disarmNav()
      navSignatureAtArm = selectedRowSignature() ?? ''
      const root = drawerRoot()
      if (root === null) return
      navObserver = new MutationObserver(() => {
        if (!drawerOpen()) {
          disarmNav()
          return
        }
        const signature = selectedRowSignature()
        if (signature !== null && signature !== navSignatureAtArm) {
          disarmNav()
          closeDrawer()
        }
      })
      navObserver.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-selected'],
      })
      navTimer = window.setTimeout(disarmNav, 2000)
    }

    const onDrawerClick = (event: MouseEvent): void => {
      if (isStrokeLocked() || consumeIfGestured(event)) return
      // A touch row-tap owns the close (pointerup or the navigation observer);
      // let the row's click reach React without toggling the drawer twice.
      if (performance.now() - lastTouchNavAt < 500) return
      if (shouldCloseOnTapInsideDrawer(event.target)) closeDrawer()
    }

    const onDrawerPointerUp = (event: PointerEvent): void => {
      if (isStrokeLocked() || consumeIfGestured(event)) return
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return
      const target = event.target
      if (!(target instanceof Element)) return
      if (!shouldCloseOnTapInsideDrawer(target)) return

      const row = target.closest('[role="treeitem"]')
      if (row !== null) {
        lastTouchNavAt = performance.now()
        if (row.getAttribute('aria-selected') === 'true') {
          // Already-selected row will not navigate; closing immediately is safe.
          closeDrawer()
        } else {
          // Unselected row: let navigation land, then close via the observer.
          armNav()
        }
        return
      }

      // Non-row nav targets (newSession / taskboard / ssh / search rows that
      // are not treeitems): the pointerup close path is still correct.
      closeDrawer()
    }

    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('click', onDrawerClick, true)
    document.addEventListener('pointerup', onDrawerPointerUp, true)
    return () => {
      disarmNav()
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('click', onDrawerClick, true)
      document.removeEventListener('pointerup', onDrawerPointerUp, true)
    }
  })
}


/**
 * Register the shared DOM reconciler tasks. Returns a disposer that
 * unregisters every task and resets the flag, so a same-environment plugin
 * reload can rebuild the reconciler from scratch.
 */
export function registerReconcileTasks(ctx: ClientContext): () => void {
  if (reconcileTasksRegistered) return () => {}
  reconcileTasksRegistered = true
  const t = ctx.locale.bind(NS)
  const removeTasks = [
    addReconcilerTask(createPreviewFullscreenTask(t)),
    addReconcilerTask(createGitChipTask()),
    addReconcilerTask(createSettingsToolbarTask()),
    addReconcilerTask(createPreviewCloseTask()),
    addReconcilerTask(createSheetRiseTask()),
    addReconcilerTask(createStatsLineTask()),
    addReconcilerTask(createJobsIndicatorTask()),
    // Legacy overlay task migrated to shell.overlay slot (ShellOverlay.tsx) — DSH-native
  ]
  return () => {
    for (const remove of removeTasks) remove()
    reconcileTasksRegistered = false
  }
}

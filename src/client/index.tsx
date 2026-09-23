import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { MobileNavToggle } from './components/MobileNavToggle.tsx'
import { MobileDrawerFooter } from './components/MobileDrawerFooter.tsx'
import { ShellOverlay } from './components/ShellOverlay.tsx'
import { MOBILE_CSS } from './styles/index.ts'

import { installFrameController, installOverlayInteractions, installPhoneChrome, installReconciler, registerReconcileTasks, installIosZoomGuard, addReconcilerTask, MOBILE_QUERY } from './effects/phone-chrome.ts'
import { createPanelExit, installPanelRowExit } from './effects/panel-exit.ts'
import { mountPluginStylesheet } from './effects/plugin-stylesheet.ts'
import { installSubagentChipTouch } from './effects/subagent-chip-touch.ts'
import { installAionuiCompat } from './effects/aionui-compat.ts'
import { installLayoutBridge } from './effects/layout-bridge.ts'
import { installViewportBridge } from './effects/viewport.ts'
import { installSidebarSwipe } from './effects/sidebar-swipe.ts'
import { installOverlayMenuTapGuard } from './effects/overlay-menu-tap-guard.ts'
import { installHeroPresetMenuFix } from './effects/preset-menu-fix.ts'
import { installComposerKeyboardTouch } from './effects/composer-keyboard-touch.ts'
import { installComposerPlusToggle } from './effects/composer-plus-toggle.ts'
import { installSessionMenuDelete } from './effects/session-menu.ts'
import { installDebugBadge } from './debug.ts'
import { NS, en, zh } from './i18n/locales.ts'
import type { MobileNavKey } from './i18n/locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Directory-drawer controls copy. */
    'mobileNav': MobileNavKey
  }
}

/** Required services (cordis fiber inject — the loader passes all module exports as an object plugin). */
export const inject = ['slots', 'layout', 'locale', 'sessionLogDownload', 'sessions', 'workspaces']

/**
 * Mobile-adaptive shell, browser half: injects the mobile stylesheet, then
 * contributes the directory toggle to the session header and the backdrop +
 * floating button to the shell overlay.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-maestro-mobile: dictionaries')

  ctx.effect(
    () => mountPluginStylesheet(MOBILE_CSS),
    'dsh-maestro-mobile: styles',
  )

  // Opt-in diagnostics (?dsh-maestro-mobile-debug=1): live state overlay plus
  // the captured-event trace used to diagnose touch behaviour on a platform
  // that cannot be emulated locally. Registered before every other effect so
  // its document listeners observe each event ahead of any that might stop it.
  installDebugBadge(ctx)

  // Hard-fix the installed-plugins list text layout: the host market UI
  // injects its own CSS after this plugin's stylesheet, so CSS overrides can
  // be beaten. Inline !important styles win over every external rule. Keep
  // the selector on outer rows only; irowActions/irowTrailing are nested
  // flex containers and must retain the market's own action geometry.
  ctx.effect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const rowSelector = '[class*="irow"]:not([class*="irowActions"]):not([class*="irowTrailing"])'
    const set = (el: HTMLElement, props: Record<string, string>): void => {
      for (const [key, value] of Object.entries(props)) {
        el.style.setProperty(key, value, 'important')
      }
    }
    const unset = (el: HTMLElement, props: readonly string[]): void => {
      for (const key of props) el.style.removeProperty(key)
    }
    const rowProps = ['flex-wrap', 'align-items', 'gap'] as const
    const firstProps = ['flex', 'max-width', 'min-width'] as const
    const textProps = ['white-space', 'overflow', 'text-overflow', 'max-width'] as const
    const clear = (): void => {
      document.querySelectorAll<HTMLElement>(rowSelector).forEach((row) => {
        unset(row, rowProps)
        const first = row.children[0] as HTMLElement | undefined
        if (first) unset(first, firstProps)
        row.querySelectorAll<HTMLElement>(':scope > button, :scope > [class*="owner"], :scope > [class*="grow"]').forEach((el) => {
          unset(el, ['order'])
        })
        const spec = row.querySelector<HTMLElement>('[class*="spec"]')
        const nm = row.querySelector<HTMLElement>('[class*="nm"]')
        if (spec) unset(spec, textProps)
        if (nm) unset(nm, textProps)
      })
    }
    const apply = (): void => {
      document.querySelectorAll<HTMLElement>(rowSelector).forEach((row) => {
        set(row, {
          'flex-wrap': 'wrap',
          'align-items': 'center',
          'gap': '4px 10px',
        })
        const first = row.children[0] as HTMLElement | undefined
        if (first) {
          set(first, {
            'flex': '1 1 100%',
            'max-width': '100%',
            'min-width': '0',
          })
        }
        const spec = row.querySelector<HTMLElement>('[class*="spec"]')
        const nm = row.querySelector<HTMLElement>('[class*="nm"]')
        if (spec) {
          set(spec, {
            'white-space': 'nowrap',
            'overflow': 'hidden',
            'text-overflow': 'ellipsis',
            'max-width': '100%',
          })
        }
        if (nm) {
          set(nm, {
            'white-space': 'nowrap',
            'overflow': 'hidden',
            'text-overflow': 'ellipsis',
            'max-width': '100%',
          })
        }
      })
    }
    const arm = (): void => {
      clear()
      if (mq.matches) apply()
    }
    arm()
    const mo = new MutationObserver(() => {
      if (mq.matches) apply()
    })
    mo.observe(document.documentElement, { childList: true, subtree: true })
    mq.addEventListener('change', arm)
    return () => {
      mo.disconnect()
      mq.removeEventListener('change', arm)
      clear()
    }
  }, 'dsh-maestro-mobile: installed-list-inline-styles')


  // Shared mobile infrastructure: frame marker ownership and the single
  // full-tree reconciler. Installed inside one effect so a plugin reload in
  // the same JS environment tears the whole reconciler down and rebuilds it.
  ctx.effect(() => {
    const stops = [
      installFrameController(),
      installReconciler(ctx),
      registerReconcileTasks(ctx),
    ]
    return () => {
      for (const stop of stops) stop()
    }
  }, 'dsh-maestro-mobile: reconciler infrastructure')

  // Sidebar panel exit: a panel REPLACES the conversation and the host ships no
  // way back, so one shared exit action serves the system back key (a
  // reconciler task), a re-tap of the already-selected panel row, and the FAB's
  // exit-panel face. Registered after the reconciler so its task is active.
  const panelExit = createPanelExit(ctx.layout)
  ctx.effect(() => addReconcilerTask(panelExit.task), 'dsh-maestro-mobile: panel back exit')
  installPanelRowExit(ctx, panelExit.exit)



  // Drawer close interactions: Escape and navigation taps inside the drawer.
  installOverlayInteractions(ctx)

  // Sidebar drawer swipe gestures (edge swipe-in / content swipe-out with B-hybrid follow)
  installSidebarSwipe(ctx)
  installOverlayMenuTapGuard(ctx)

  // DSH-native bridges (reuse AppFrame breakpoint + ThemePresenter)
  installLayoutBridge(ctx)
  installViewportBridge(ctx)

  // Lineage-count chip: reliable open/close on touch pointers (upstream is
  // hover-timer driven and has no onClick on the count variant).
  installSubagentChipTouch(ctx)

  installPhoneChrome(ctx)

  // iOS focus-zoom guard marker: ungated (every width/pointer) so the 16px
  // floor in misc.css.ts holds on iPad viewports that never match the phone
  // breakpoint. Non-iOS engines never carry the marker.
  installIosZoomGuard(ctx)

  installAionuiCompat(ctx)

  // New-session hero preset list on mobile: long lists previously clipped the
  // top presets above the viewport due to the host Menu's inverted clamp
  // (100vh-measured height vs innerHeight). Post-correct fixed portal menus
  // on narrow viewports and cap height to dvh.
  installHeroPresetMenuFix(ctx)

  // Composer toolbar soft-keyboard guard: upstream keepFocus forces focus on
  // the contenteditable for every toolbar mousedown, which pops the soft
  // keyboard on each phone tap of Commands / Stop / Send.
  installComposerKeyboardTouch(ctx)

  // Composer "+" command menu: the host's second-tap close is unreachable
  // because focusing the editor re-tracks and clears the menu launcher. This
  // finishes the tap through the host's own Escape path.
  installComposerPlusToggle(ctx)

  // Session deletion on touch-primary devices (every width): injects a delete
  // item into the host's per-session row menu and drives a confirmation-first
  // dialog against the host route. The host menu knows rename / fork / archive
  // only; archive hides a row without removing its log.
  installSessionMenuDelete(ctx)

  // DSH-native overlay: backdrop + FAB via AppFrame's overlayLayer (z20)
  // Replaces manual frame.appendChild in overlay-backdrop-fab.ts — keeps
  // the legacy task as compat until the next major, but the slot is the
  // source of truth for backdrop/FAB now.
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'mobile-shell-overlay',
    locale: NS,
    inject: () => ({
      toggleSidebar: () => ctx.layout.toggleSidebar(),
      exitPanel: () => panelExit.exit(),
    }),
  }, ShellOverlay))

  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'mobile-nav-toggle',
    order: 10,
    locale: NS,
    inject: () => ({
      toggleSidebar: () => ctx.layout.toggleSidebar(),
    }),
  }, MobileNavToggle))


  // Session log download, relocated from the session header to the drawer
  // footer on mobile (the header capsule is hidden by CSS).
  //
  // Footer stacking relies on the list-slot sort by (priority, order):
  // dsh-remote-web-ui leaves it unset (default 0, its two icon buttons stay
  // on top) and dsh-usage-stats uses 10. Order 5 keeps the Session log pill
  // directly under the icon row with the usage/balance badge below it —
  // instead of a tie at 10 where registration order could wedge the badge
  // between the icons and the pill.
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'mobile-nav-session-log',
    order: 5,
    locale: NS,
    inject: () => ({
      downloadSessionLog: (sessionId: string) => ctx.sessionLogDownload.download(sessionId),
    }),
  }, MobileDrawerFooter))
}

// Type-only augmentation imports: pull the layout / conversation / sidebar /
// settings SlotMap merges, the renderer slots service, the session/workspace
// service typings, the session global-standard props (useSessions), and the
// sessionLogDownload service typing into this program without any runtime import.
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-session-log-export/client'

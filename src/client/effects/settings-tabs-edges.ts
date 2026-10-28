import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { installMobileEffect } from './phone-chrome.ts'

/**
 * Edge affordance for the Settings tab strip.
 *
 * The strip is a horizontal scroller: on 0.2.2-alpha.2 it carried 1186px of tabs
 * inside a 356px viewport at 390px, so six of the nine tabs sit off-screen and
 * the third one is clipped mid-pill. The stylesheet hides the scrollbar
 * (`scrollbar-width: none`), which left nothing on screen saying the strip
 * continues, so the tabs past "Built-in plugins" were undiscoverable.
 *
 * This effect publishes which edges are actually cut as an attribute on the
 * list, and the stylesheet fades exactly those edges. A fade on a side that has
 * nothing behind it would cut the last pill for no reason, hence the state
 * rather than a constant gradient.
 */

/** Marker the stylesheet's fade rules are scoped to (set on the tab list). */
export const TABS_ATTR = 'data-mobile-nav-tabs'

/** Which ends of the strip are cut, i.e. which edges need a fade. */
export type TabsEdgeState = 'none' | 'start' | 'end' | 'both'

/** The scroll metrics the decision reads. */
export interface TabsMetrics {
  readonly scrollLeft: number
  readonly scrollWidth: number
  readonly clientWidth: number
}

/** Tolerance for fractional touch scroll offsets, in CSS pixels. */
const EDGE_SLOP = 1

/**
 * Which edges of a horizontal strip are cut off.
 * @param metrics - the element's scroll metrics.
 * @returns `'end'` at the start (right side cut), `'start'` at the end (left
 * side cut), `'both'` in the middle, `'none'` when everything fits.
 */
export function tabsEdgeState(metrics: TabsMetrics): TabsEdgeState {
  const scrollable = metrics.scrollWidth - metrics.clientWidth
  if (scrollable <= EDGE_SLOP) return 'none'
  const atStart = metrics.scrollLeft <= EDGE_SLOP
  const atEnd = metrics.scrollLeft >= scrollable - EDGE_SLOP
  if (atStart && atEnd) return 'none'
  if (atStart) return 'end'
  if (atEnd) return 'start'
  return 'both'
}

/** Read one list element's metrics. */
function metricsOf(list: HTMLElement): TabsMetrics {
  return { scrollLeft: list.scrollLeft, scrollWidth: list.scrollWidth, clientWidth: list.clientWidth }
}

/**
 * Track the Settings tab strip and mark which of its edges are cut.
 * @param ctx - client root context; the whole effect is telemetry-free and
 * disposes with the plugin.
 */
export function installSettingsTabsEdges(ctx: ClientContext): void {
  installMobileEffect(ctx, 'dsh-maestro-mobile: settings tab edges', () => {
    let attached: { list: HTMLElement; stop: () => void } | null = null

    const attach = (list: HTMLElement): void => {
      const update = (): void => {
        list.setAttribute(TABS_ATTR, tabsEdgeState(metricsOf(list)))
      }
      const observer = new ResizeObserver(update)
      observer.observe(list)
      list.addEventListener('scroll', update, { passive: true })
      update()
      attached = {
        list,
        stop: () => {
          observer.disconnect()
          list.removeEventListener('scroll', update)
          list.removeAttribute(TABS_ATTR)
        },
      }
    }

    // The sheet mounts (and unmounts) on demand, so re-bind whenever the list
    // in the document is not the node already tracked.
    const sync = (): void => {
      const list = document.querySelector<HTMLElement>('[class*="_navList"]')
      if (list !== null && attached?.list === list) return
      attached?.stop()
      attached = null
      if (list !== null) attach(list)
    }

    const mutations = new MutationObserver(sync)
    mutations.observe(document.documentElement, { childList: true, subtree: true })
    sync()

    return () => {
      mutations.disconnect()
      attached?.stop()
      attached = null
    }
  })
}

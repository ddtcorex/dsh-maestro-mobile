import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { MOBILE_QUERY } from './phone-chrome.ts'

/**
 * Viewport + theme-color bridge: reuses DSH ThemePresenter where possible.
 * On narrow screens: viewport-fit=cover so env(safe-area-inset-*) is real;
 * theme-color tracks body background via DSH's theme/change event when
 * available, falling back to getComputedStyle.
 * @param ctx - client root context.
 */
export function installViewportBridge(ctx: ClientContext): void {
  ctx.effect(() => {
    const narrow = window.matchMedia(MOBILE_QUERY)
    const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
    const originalViewport = viewport?.content ?? ''
    let themeMeta: HTMLMetaElement | null = null

    const ensureThemeMeta = (): HTMLMetaElement => {
      if (themeMeta !== null) return themeMeta
      const m = document.createElement('meta')
      m.name = 'theme-color'
      themeMeta = m
      return m
    }

    const bodyBg = (): string => getComputedStyle(document.body).backgroundColor

    const sync = (): void => {
      if (narrow.matches && viewport !== null) {
        const locked = /(^|,)\s*maximum-scale\s*=/.test(viewport.content)
        viewport.content = `width=device-width, initial-scale=1${locked ? ', maximum-scale=1' : ''}, viewport-fit=cover`
      }
      if (narrow.matches) {
        const m = ensureThemeMeta()
        m.content = bodyBg()
        if (m.parentElement === null) document.head.appendChild(m)
      } else {
        themeMeta?.remove()
      }
    }

    const restore = (): void => {
      if (viewport !== null) viewport.content = originalViewport
      themeMeta?.remove()
      themeMeta = null
    }

    const onGestureStart = (event: Event): void => event.preventDefault()

    // Prefer DSH theme/change event if available; fall back to MutationObserver
    let offTheme: (() => void) | undefined
    try {
      const maybeOn = (ctx as unknown as { on?: (event: string, handler: (s: unknown) => void) => () => void }).on
      if (typeof maybeOn === 'function') {
        offTheme = maybeOn.call(ctx, 'theme/change', () => {
          if (themeMeta !== null) themeMeta.content = bodyBg()
        })
      }
    } catch {
      // ctx.on not available in this context — fall back to observer
    }

    const observer = new MutationObserver(() => {
      if (themeMeta !== null) themeMeta.content = bodyBg()
    })
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })

    document.addEventListener('gesturestart', onGestureStart)
    sync()
    const onChange = (): void => sync()
    narrow.addEventListener('change', onChange)

    return () => {
      observer.disconnect()
      offTheme?.()
      document.removeEventListener('gesturestart', onGestureStart)
      narrow.removeEventListener('change', onChange)
      restore()
    }
  }, 'dsh-maestro-mobile: viewport bridge (reuse DSH ThemePresenter)')
}

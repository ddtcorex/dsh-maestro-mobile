import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { DESKTOP_QUERY, MOBILE_QUERY } from './effects/phone-chrome.ts'

/** Overlay surfaces whose taps this plugin reasons about (see sidebar-swipe). */
const TRACE_MENU_SELECTOR = '[role="menu"], [role="listbox"], [data-trigger-menu]'

/** Event types whose propagation order decides whether a menu tap lands. */
const TRACE_TYPES = ['pointerdown', 'touchstart', 'mousedown', 'mouseup', 'click', 'focusin', 'focusout'] as const

/** How many trace lines the frozen report keeps. */
const TRACE_LIMIT = 22

/**
 * Live state that explains a phone-side jump: the visual viewport (the keyboard
 * shrinks it), the composer seat's top edge (the row that visibly moves), the
 * focus-shadow state (whether the tap's focus was blocked) and the active
 * element. Recorded per event and by the sampler below, because the interesting
 * movement happens between events.
 */
function stateStamp(): string {
  const viewport = window.visualViewport
  const vv = viewport === undefined || viewport === null ? -1 : Math.round(viewport.height)
  const seat = document.querySelector('[data-composer-seat]')
  const seatTop = seat === null ? -1 : Math.round(seat.getBoundingClientRect().top)
  const shadow = document.documentElement.hasAttribute('data-mobile-nav-focus-shadow') ? 1 : 0
  const active = document.activeElement
  const activeTag = active === null ? 'null' : active.tagName.toLowerCase()
  return `vv=${vv}/${innerHeight} seat=${seatTop} sh=${shadow} af=${activeTag}`
}

/** Compact one-line description of an event target. */
function describeNode(node: unknown): string {
  if (node === null || node === undefined) return 'null'
  if (!(node instanceof Element)) return typeof node === 'string' ? node : String(node)
  const role = node.getAttribute('role') ?? ''
  const last = String(node.className || '').split(' ').filter(Boolean).pop() ?? ''
  const text = (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 16)
  const inMenu = node.closest(TRACE_MENU_SELECTOR) !== null ? 'M' : '-'
  return `${node.tagName.toLowerCase()}${role === '' ? '' : `:${role}`}.${last.slice(0, 12)}[${inMenu}]${text === '' ? '' : `"${text}"`}`
}

/**
 * Debug badge — ?dsh-maestro-mobile-debug=1 (legacy ?mobile-nav-debug=1)
 * Renders a live state overlay (URL, viewport, media queries, shell chrome,
 * aionui columns, captured errors) so a phone-side repro can be diagnosed
 * without guessing. No-op unless one of the query params is present.
 *
 * It also records a captured-event trace and freezes it when the operator taps
 * the badge: touch-event order (pointer/touch/mouse/focus/click), whether each
 * event reached the document in the bubble phase, and the overlay-menu and
 * focus state beside it. That trace is the only evidence available for a
 * platform whose touch semantics cannot be emulated locally (iOS Safari), so
 * it is reported on screen rather than inferred.
 */
export function installDebugBadge(ctx: ClientContext): void {
  ctx.effect(() => {
    const query = new URLSearchParams(location.search)
    // Remember the flag for the rest of the tab: a PIN/token redirect may drop
    // the query string on the way back to the bare origin.
    const queryFlag = query.has('dsh-maestro-mobile-debug') || query.has('mobile-nav-debug')
    let armed = queryFlag
    try {
      if (queryFlag) sessionStorage.setItem('dsh-maestro-mobile-debug', '1')
      else armed = sessionStorage.getItem('dsh-maestro-mobile-debug') === '1'
    } catch {
      // Storage can be unavailable (private mode); the query flag still works.
    }
    if (!armed) return () => {}
    const errors: string[] = []
    const onError = (event: ErrorEvent) => errors.push(`ERR ${event.message.slice(0, 120)}`)
    const onRejection = (event: PromiseRejectionEvent) => errors.push(`REJ ${String(event.reason).slice(0, 120)}`)
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)

    const badge = document.createElement('div')
    badge.style.cssText = [
      'position:fixed', 'top:40px', 'right:6px', 'z-index:2147483000',
      'background:rgba(0,0,0,.82)', 'color:#fff', 'font:11px/1.5 ui-monospace,monospace',
      'padding:8px 10px', 'border-radius:8px', 'max-width:94vw', 'max-height:70vh',
      'overflow:auto', 'white-space:pre-wrap', 'pointer-events:none',
    ].join(';')

    // --- event trace -------------------------------------------------------
    const trace: string[] = []
    let frozen = false
    const menuCount = (): number => document.querySelectorAll(TRACE_MENU_SELECTOR).length
    const push = (line: string): void => {
      if (frozen) return
      trace.push(line)
      if (trace.length > TRACE_LIMIT * 2) trace.splice(0, trace.length - TRACE_LIMIT * 2)
    }
    const onTrace = (type: string, event: Event): void => {
      const pointer = (event as PointerEvent).pointerType
      const related = event instanceof FocusEvent ? ` ->${describeNode(event.relatedTarget)}` : ''
      const prevented = event.defaultPrevented ? ' PREVENTED' : ''
      push(`${type}${pointer === undefined ? '' : `/${pointer}`} ${describeNode(event.target)}${related}${prevented} | menu=${menuCount()} ${stateStamp()}`)
    }
    // Capture phase records every event; the bubble-phase twin exists only when
    // nothing stopped propagation, which is what exposes a swallowing listener.
    const onTraceTail = (type: string, event: Event): void => {
      const pointer = (event as PointerEvent).pointerType
      push(`${type}^${pointer === undefined ? '' : `/${pointer}`} reached-document${event.defaultPrevented ? ' PREVENTED' : ''} ${stateStamp()}`)
    }
    const captureHandlers = TRACE_TYPES.map((type) => {
      const handler = (event: Event) => onTrace(type, event)
      return { type, handler }
    })
    const tailHandlers = (['mousedown', 'click'] as const).map((type) => {
      const handler = (event: Event) => onTraceTail(type, event)
      return { type, handler }
    })
    for (const { type, handler } of captureHandlers) document.addEventListener(type, handler, true)
    for (const { type, handler } of tailHandlers) document.addEventListener(type, handler)

    // The jump a phone user reports happens BETWEEN events (the keyboard slides,
    // the sticky seat follows it), so sample the same state on a short ladder
    // after a tap on the composer "+" and label each sample with its delay.
    const SAMPLE_DELAYS_MS = [0, 60, 120, 250, 450, 800] as const
    let sampling = false
    const onSampleTrigger = (event: Event): void => {
      if (sampling) return
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('[data-composer-card] button[aria-haspopup="listbox"]') === null) return
      sampling = true
      for (const delay of SAMPLE_DELAYS_MS) {
        window.setTimeout(() => {
          push(`SAMPLE+${delay}ms menu=${menuCount()} ${stateStamp()}`)
          if (delay === SAMPLE_DELAYS_MS[SAMPLE_DELAYS_MS.length - 1]) sampling = false
        }, delay)
      }
    }
    document.addEventListener('pointerdown', onSampleTrigger, true)
    document.addEventListener('click', onSampleTrigger, true)

    // --- report ------------------------------------------------------------
    const read = (): string => {
      const q = (sel: string) => !!document.querySelector(sel)
      const vis = (sel: string) => {
        const el = document.querySelector<HTMLElement>(sel)
        return el === null ? 'absent' : getComputedStyle(el).visibility
      }
      const frame = document.querySelector<HTMLElement>('[data-mobile-nav="frame"]')
      const head = [
        `URL ${location.pathname}${location.search}`,
        `W ${innerWidth} x ${innerHeight} dpr ${devicePixelRatio}`,
        `mq≤1023 ${matchMedia(MOBILE_QUERY).matches}  mq≥1024 ${matchMedia(DESKTOP_QUERY).matches}`,
        `css ${q('style[data-plugin-css*="mobile"]')}  frame ${!!frame}`,
        `previewCol ${vis('[data-aionui-preview-col]')}  explorerCol ${vis('[data-aionui-explorer-col]')}`,
        `previewOpen ${frame?.hasAttribute('data-aionui-preview-open') ?? '?'}  explorerOpen ${frame?.hasAttribute('data-aionui-explorer-open') ?? '?'}  previewFull ${frame?.hasAttribute('data-mobile-preview-full') ?? '?'}`,
        `header ${vis('[data-phase] header')}  composer ${q('[data-composer-input]')}`,
        `phase ${document.querySelector('[data-phase]')?.getAttribute('data-phase') ?? '?'}`,
        `errs ${errors.slice(-5).join(' | ') || 'none'}`,
      ]
      if (!frozen) return head.join('\n')
      return [...head, '── trace (frozen) ──', ...trace.slice(-TRACE_LIMIT)].join('\n')
    }
    const paint = (): void => {
      // The collapsed button is a static label; repainting it would erase the
      // affordance on every body mutation and interval tick.
      if (!frozen) return
      badge.textContent = read()
    }

    // Collapsed: a small button clear of the composer model card (top right,
    // above the card's own viewport), so the operator can reproduce the tap
    // first and only then reveal the trace. It must stay tappable, so unlike
    // the expanded report it keeps pointer events.
    const collapsedCss = badge.style.cssText.replace('pointer-events:none', 'pointer-events:auto')
    const expandedCss = badge.style.cssText.replace('pointer-events:none', 'pointer-events:auto')
    const collapse = (): void => {
      frozen = false
      trace.length = 0
      badge.textContent = 'trace ▶'
      badge.style.cssText = collapsedCss
    }
    const expand = (): void => {
      frozen = true
      badge.style.cssText = expandedCss
      badge.textContent = read()
    }
    const onClickBadge = (): void => {
      if (frozen) collapse()
      else expand()
    }
    badge.addEventListener('click', onClickBadge)
    badge.textContent = 'trace ▶'

    // Never re-enter on the badge's own textContent mutations: paint() writes
    // into a body subtree, so a naive full-tree observer would feed its own
    // output back into paint() forever and starve the page (observed as a hard
    // freeze with ?mobile-nav-debug=1).
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.target === badge || badge.contains(record.target)) continue
        paint()
        return
      }
    })
    observer.observe(document.body, { childList: true, subtree: true, attributes: true })
    const timer = setInterval(paint, 1500)
    document.body.appendChild(badge)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
      document.removeEventListener('click', onClickBadge)
      for (const { type, handler } of captureHandlers) document.removeEventListener(type, handler, true)
      for (const { type, handler } of tailHandlers) document.removeEventListener(type, handler)
      document.removeEventListener('pointerdown', onSampleTrigger, true)
      document.removeEventListener('click', onSampleTrigger, true)
      observer.disconnect()
      clearInterval(timer)
      badge.remove()
    }
  }, 'dsh-maestro-mobile: debug badge')
}

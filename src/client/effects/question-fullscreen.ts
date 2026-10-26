import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { answerFieldScrollTop, hostCardHeightPx, nextQuestionFull, questionBandPx } from '../core/question-fullscreen.ts'
import { seatElement } from '../core/composer-dom.ts'
import { getFrame, installMobileEffect } from './phone-chrome.ts'

const NS = 'dshMaestroMobileNav'
const FULL_MARKER = 'data-mobile-nav-question-full'
const RESERVE_VAR = '--mobile-question-reserve'
const BAND_VAR = '--mobile-question-band'
const BUTTON_MARKER = 'question-expand'
const CARD_SELECTOR = '[data-question-key] [class*="_card"]'
const ACTIONS_SELECTOR = '[data-question-key] [class*="_headerActions"]'
const BODY_SELECTOR = '[data-question-key] [class*="_body"]'
const FIELD_SELECTOR = '[data-question-key] textarea, [data-question-key] [class*="_fieldInput"], [data-question-key] [class*="_field"]'

const ICONS = [
  '<svg class="dsh-maestro-mobile-question-expand" viewBox="0 0 16 16" fill="none" aria-hidden="true">',
  '<path d="M6 2H2v4M10 2h4v4M6 14H2v-4M10 14h4v-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  '</svg>',
  '<svg class="dsh-maestro-mobile-question-collapse" viewBox="0 0 16 16" fill="none" aria-hidden="true">',
  '<path d="M2 6h4V2M14 6h-4V2M2 10h4v4M14 10h-4v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  '</svg>',
].join('')

/**
 * Manual ask-card fullscreen plus answer scroll-back (ported from
 * mexiaosqwq/dsh-web-mobile v3.2.2): the host card caps at min(60vh, 520px)
 * which shrinks with the keyboard, and the answer field is the last block of
 * the scrollable body, so it scrolls out of view after focus. The injected
 * expand button toggles a frame marker, the measured reserve sizes the card
 * to the header-to-composer band, and the focused answer field is scrolled
 * back into the body intersect visual viewport. Manual only, fail-open to
 * the host default.
 * @param ctx - client root context.
 */
export function installQuestionFullscreen(ctx: ClientContext): void {
  installMobileEffect(ctx, 'dsh-maestro-mobile: question fullscreen', () => {
    const t = ctx.locale.bind(NS) as (key: string) => string
    let requested = false
    let armed = false
    let button: HTMLButtonElement | null = null
    let published: HTMLElement | null = null
    let reserveText = ''
    let frame = 0

    const cardOf = (): HTMLElement | null => document.querySelector<HTMLElement>(CARD_SELECTOR)
    const label = (): string => t(armed ? 'questionCollapse' : 'questionExpand')

    const syncButton = (): void => {
      if (button === null) return
      const text = label()
      if (button.getAttribute('aria-label') !== text) {
        button.setAttribute('aria-label', text)
        button.title = text
      }
      const expanded = armed ? 'true' : 'false'
      if (button.getAttribute('aria-expanded') !== expanded) button.setAttribute('aria-expanded', expanded)
    }

    const clear = (): void => {
      requested = false
      armed = false
      if (frame !== 0) {
        cancelAnimationFrame(frame)
        frame = 0
      }
      const host = getFrame()
      if (host !== null && host.hasAttribute(FULL_MARKER)) host.removeAttribute(FULL_MARKER)
      published?.style.removeProperty(RESERVE_VAR)
      published?.style.removeProperty(BAND_VAR)
      published = null
      reserveText = ''
      syncButton()
    }

    const keepAnswerVisible = (): void => {
      const active = document.activeElement
      if (!(active instanceof HTMLElement) || active.matches(FIELD_SELECTOR) === false) return
      const body = active.closest<HTMLElement>(BODY_SELECTOR) ?? active.closest<HTMLElement>(CARD_SELECTOR)
      if (body === null) return
      const fieldRect = active.getBoundingClientRect()
      const bodyRect = body.getBoundingClientRect()
      const visual = window.visualViewport
      const next = answerFieldScrollTop({
        fieldTop: fieldRect.top,
        fieldBottom: fieldRect.bottom,
        bodyTop: bodyRect.top,
        bodyBottom: bodyRect.bottom,
        scrollTop: body.scrollTop,
        scrollHeight: body.scrollHeight,
        clientHeight: body.clientHeight,
        visibleTop: visual?.offsetTop ?? Number.NaN,
        visibleBottom: visual === null || visual === undefined ? Number.NaN : visual.offsetTop + visual.height,
      })
      if (Math.abs(next - body.scrollTop) >= 1) body.scrollTop = next
    }

    const measure = (): void => {
      frame = 0
      const host = getFrame()
      const card = cardOf()
      if (host === null || card === null) {
        clear()
        return
      }
      const header = host.querySelector<HTMLElement>('[data-slot="conversation.session.header"] > header, [data-slot="conversation.session.header"] > div')
      const seat = seatElement()
      const cardRect = card.getBoundingClientRect()
      const seatRect = seat?.getBoundingClientRect() ?? null
      const style = getComputedStyle(card)
      const viewport = window.visualViewport
      const visible = Math.min(window.innerHeight, viewport?.height ?? window.innerHeight)
      const band = questionBandPx({
        visibleHeight: visible,
        headerHeight: header?.getBoundingClientRect().bottom ?? Number.NaN,
        frameBottom: cardRect.bottom,
        seatBottom: seatRect === null ? Number.NaN : seatRect.bottom,
        framePadding: Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom),
      })
      const next = nextQuestionFull(armed, requested, band.bandPx, hostCardHeightPx(visible))
      const nextReserve = `${String(Math.round(band.reservePx))}px`
      const nextBand = `${String(Math.round(band.bandPx))}px`
      if (published !== card) {
        published?.style.removeProperty(RESERVE_VAR)
        published?.style.removeProperty(BAND_VAR)
        published = card
        reserveText = ''
      }
      if (reserveText !== `${nextReserve}/${nextBand}`) {
        reserveText = `${nextReserve}/${nextBand}`
        card.style.setProperty(RESERVE_VAR, nextReserve)
        card.style.setProperty(BAND_VAR, nextBand)
      }
      if (next !== host.hasAttribute(FULL_MARKER)) {
        if (next) host.setAttribute(FULL_MARKER, '')
        else host.removeAttribute(FULL_MARKER)
      }
      armed = next
      syncButton()
      if (!armed) requested = false
    }

    const schedule = (): void => {
      if (frame !== 0) return
      frame = requestAnimationFrame(() => {
        frame = 0
        keepAnswerVisible()
        if (requested) measure()
      })
    }

    const onClick = (): void => {
      requested = !armed
      if (frame !== 0) {
        cancelAnimationFrame(frame)
        frame = 0
      }
      measure()
      if (!armed) requested = false
    }

    const ensureButton = (): void => {
      const actions = document.querySelector<HTMLElement>(ACTIONS_SELECTOR)
      if (actions === null) return
      if (button === null) {
        const element = document.createElement('button')
        element.type = 'button'
        element.dataset.mobileNav = BUTTON_MARKER
        element.innerHTML = ICONS
        element.addEventListener('click', onClick)
        button = element
      }
      if (button.parentElement !== actions) actions.insertBefore(button, actions.lastElementChild)
      syncButton()
    }

    const observer = new MutationObserver(() => {
      if (cardOf() === null) {
        clear()
        return
      }
      ensureButton()
      if (requested) schedule()
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
    window.addEventListener('resize', schedule)
    window.addEventListener('orientationchange', schedule)
    window.visualViewport?.addEventListener('resize', schedule)
    document.addEventListener('focusin', schedule, true)
    document.addEventListener('focusout', schedule, true)
    ensureButton()
    schedule()

    return () => {
      window.removeEventListener('resize', schedule)
      window.removeEventListener('orientationchange', schedule)
      window.visualViewport?.removeEventListener('resize', schedule)
      document.removeEventListener('focusin', schedule, true)
      document.removeEventListener('focusout', schedule, true)
      observer.disconnect()
      clear()
      if (button !== null) {
        button.removeEventListener('click', onClick)
        button.remove()
        button = null
      }
    }
  })
}

/**
 * Ask-question fullscreen band and answer scroll-back. Pure geometry,
 * DOM-free so every number is unit-testable. Ported from
 * mexiaosqwq/dsh-web-mobile v3.2.2: the host card caps at min(60vh, 520px)
 * which shrinks with the keyboard, while the answer field is the last block
 * of the only scrollable body, so it scrolls out of view after focus.
 */

/** Host card ceiling ratio and cap: min(60vh, 520px). */
export const HOST_CARD_HEIGHT_RATIO = 0.6
export const HOST_CARD_HEIGHT_CAP_PX = 520

/** Gap kept between the answer field and the body edges on scroll-back. */
export const ANSWER_FIELD_MARGIN_PX = 8

/** Everything the band needs, measured by the effect. */
export interface QuestionBandInput {
  /** min(innerHeight, visualViewport.height). */
  readonly visibleHeight: number
  /** Frame top to header bottom. */
  readonly headerHeight: number
  /** Card frame bottom edge. */
  readonly frameBottom: number
  /** Composer seat bottom edge. */
  readonly seatBottom: number
  /** Frame vertical padding. */
  readonly framePadding: number
}

export interface QuestionBand {
  /** Height under the card the card must give back. */
  readonly reservePx: number
  /** Height the card may take in fullscreen, 0 when untrusted. */
  readonly bandPx: number
}

const USELESS: QuestionBand = { reservePx: 0, bandPx: 0 }

/**
 * Fullscreen band between the header bottom and the composer top.
 * Fail-open: a wrong 0 keeps the host default, a wrong positive would size
 * the card against a band that is not on screen.
 */
export function questionBandPx(input: QuestionBandInput): QuestionBand {
  const { visibleHeight, headerHeight, frameBottom, seatBottom, framePadding } = input
  for (const value of [visibleHeight, headerHeight, frameBottom, seatBottom, framePadding]) {
    if (!Number.isFinite(value)) return USELESS
  }
  if (visibleHeight <= 0 || headerHeight < 0) return USELESS
  const belowSeatPx = Math.max(0, visibleHeight - seatBottom)
  const belowFramePx = Math.max(0, seatBottom - frameBottom)
  const reservePx = belowSeatPx + belowFramePx + Math.max(0, framePadding)
  const bandPx = Math.max(0, visibleHeight - headerHeight - reservePx)
  return { reservePx, bandPx }
}

/**
 * Host ceiling for the same viewport.
 */
export function hostCardHeightPx(visibleHeight: number): number {
  if (!Number.isFinite(visibleHeight) || visibleHeight <= 0) return 0
  return Math.min(visibleHeight * HOST_CARD_HEIGHT_RATIO, HOST_CARD_HEIGHT_CAP_PX)
}

/**
 * Whether the fullscreen marker is on. Manual toggle only: requested false
 * always wins, entering needs band above host default, leaving happens only
 * on unusable measurement, never because the band shrank.
 */
export function nextQuestionFull(previous: boolean, requested: boolean, bandPx: number, hostDefaultPx: number): boolean {
  if (!requested) return false
  if (!Number.isFinite(bandPx) || bandPx <= 0) return false
  if (previous) return true
  if (!Number.isFinite(hostDefaultPx) || hostDefaultPx <= 0) return true
  return bandPx > hostDefaultPx
}

/** Scrollable box plus the answer field rect. */
export interface AnswerFieldView {
  readonly fieldTop: number
  readonly fieldBottom: number
  readonly bodyTop: number
  readonly bodyBottom: number
  readonly scrollTop: number
  readonly scrollHeight: number
  readonly clientHeight: number
  readonly visibleTop?: number
  readonly visibleBottom?: number
}

/**
 * Where the card body must scroll so the answer field is visible again.
 * Visible box is body intersect visual viewport. Never scrolls ancestors.
 */
export function answerFieldScrollTop(view: AnswerFieldView): number {
  const { fieldTop, fieldBottom, bodyTop, bodyBottom, scrollTop, scrollHeight, clientHeight, visibleTop, visibleBottom } = view
  for (const value of [fieldTop, fieldBottom, bodyTop, bodyBottom, scrollTop, scrollHeight, clientHeight]) {
    if (!Number.isFinite(value)) return scrollTop
  }
  const top = visibleTop === undefined || !Number.isFinite(visibleTop) ? bodyTop : Math.max(bodyTop, visibleTop)
  const bottom = visibleBottom === undefined || !Number.isFinite(visibleBottom) ? bodyBottom : Math.min(bodyBottom, visibleBottom)
  if (bottom - top < 1) return scrollTop
  const max = Math.max(0, scrollHeight - clientHeight)
  const room = Math.max(0, bottom - top)
  const margin = Math.min(ANSWER_FIELD_MARGIN_PX, room / 2)
  let next = scrollTop
  if (fieldTop < top + margin) next = scrollTop - (top + margin - fieldTop)
  else if (fieldBottom > bottom - margin) next = scrollTop + (fieldBottom - (bottom - margin))
  return Math.min(Math.max(next, 0), max)
}

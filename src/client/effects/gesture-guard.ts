const consumed = new Map<EventTarget, number>()

let strokeLocked = false

export function markStrokeLocked(): void {
  strokeLocked = true
}

export function clearStrokeLocked(): void {
  strokeLocked = false
}

export function isStrokeLocked(): boolean {
  return strokeLocked
}

function isElementLike(value: unknown): value is { parentElement: unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'parentElement' in value &&
    (value as { parentElement?: unknown }).parentElement !== undefined
  )
}

export function markGestureConsumed(
  target: EventTarget,
  windowMs: number,
  upTo?: Element | null,
): void {
  const until = performance.now() + windowMs
  if (!isElementLike(target)) {
    consumed.set(target, until)
    return
  }
  let el: { parentElement: unknown } | null = target
  while (el !== null) {
    consumed.set(el as unknown as EventTarget, until)
    if (el === upTo) break
    el = isElementLike(el.parentElement) ? el.parentElement : null
  }
}

export function consumeIfGestured(event: Event): boolean {
  const now = performance.now()
  const target = event.target
  if (!isElementLike(target)) {
    for (const [t, until] of consumed) {
      if (until <= now) consumed.delete(t)
    }
    return false
  }
  let el: { parentElement: unknown } | null = target
  while (el !== null) {
    const until = consumed.get(el as unknown as EventTarget)
    if (until !== undefined) {
      if (until <= now) {
        consumed.delete(el as unknown as EventTarget)
      } else {
        return true
      }
    }
    el = isElementLike(el.parentElement) ? el.parentElement : null
  }
  return false
}

export function isGestureConsumed(target: Element): boolean {
  const until = consumed.get(target)
  if (until === undefined) return false
  if (until <= performance.now()) {
    consumed.delete(target)
    return false
  }
  return true
}

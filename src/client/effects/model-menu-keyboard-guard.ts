/**
 * Keep the host model / reasoning menu from raising the soft keyboard on phones.
 *
 * Why this exists: `dsh-client-ui-model-selection` renders a model /
 * reasoning-level menu; tapping the model row drills into the model pane and a
 * passive effect calls `searchRef.current?.focus()` on the pane's search field.
 * On desktop that is a convenience; on a phone it hands the engine a DOM focus
 * on a text input, the soft keyboard rises, and it covers the model list the
 * user had just opened.
 *
 * Why a METHOD shadow: that focus runs in a passive effect right after the
 * pane commits, so any observer-based arming is a race — the shadow has to be
 * in place strictly BEFORE the effect can run. Making the field's `focus()` a
 * no-op is the only thing that works: once the host's `focus()` has run, the
 * keyboard is up and an after-the-fact blur leaves it there (the same finding
 * `editor-focus-shadow.ts` documents for the composer).
 *
 * Why the capture-phase pointerdown: it is the last deterministic moment before
 * the drill tap. The tap that opens the menu, or drills into the pane, always
 * passes through `pointerdown` first; the host's passive effect always runs
 * after. Arming here is therefore strictly earlier than the focus it must
 * swallow. A real tap ON the field still focuses it natively — only the JS
 * method is replaced, never the browser's own focus path — so searching stays
 * one deliberate tap away.
 *
 * Why the PROTOTYPE level, not the shared `createFocusShadow` helper: that
 * helper shadows one resolved ELEMENT, which works for the composer's stable
 * editing surface but not here. The menu is portaled, appears and disappears,
 * and its field remounts on every drill-in with an identity unknown at arm
 * time; resolving the element before the host's passive effect focuses it is
 * the very race this guard exists to avoid. Shadowing
 * `HTMLInputElement.prototype.focus` with a `matches()` gate covers any
 * present or future matching field with a single arm, while every
 * non-matching field falls through to the untouched native method. There is a
 * single owner and no stable element to hold, so the helper's per-element
 * reference counting buys nothing here.
 *
 * Cost (deliberately minimal): one capture listener, one `querySelector` per
 * tap plus one idle check ~2s after the last tap. No MutationObserver — the
 * session streams text every frame, so a subtree observer would run on every
 * frame.
 *
 * DOM contract:
 * - the portaled menu surface carries the primitives' `data-menu-material`
 *   marker (`dsh-client-ui-primitives` MenuSurface);
 * - the pane's search field is an `input[role="searchbox"]` inside such a
 *   surface, or carries the model list's own `aria-controls="<menuId>-models"`.
 * Re-audit both when the host or `dsh-client-ui-model-selection` upgrades.
 *
 * Deliberate divergence from upstream
 * (`mexiaosqwq/dsh-web-mobile` v3.0.5 `model-menu-keyboard-guard.ts`): upstream
 * scopes the menu surface as
 * `[data-menu-material], [class*="_7KE1Ra_menu"]`, with the hashed
 * CSS-module class as a fallback. That fallback is dropped here on purpose:
 * `tests/no-hashed-class-prefix.test.ts` fails the build on any hash prefix in
 * `src/client`, because a selector built from a build hash dies on the next
 * rebuild while every test still passes. The surface is therefore scoped by the
 * stable primitive marker alone, and the field additionally by its own
 * `-models` control, which needs no fallback at all.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { installMobileEffect } from './phone-chrome.ts'

/**
 * Host menu surface marker: the stable primitive marker only.
 *
 * Upstream also matches a hashed CSS-module class fallback; see the header for
 * why that fallback is deliberately not ported.
 */
export const HOST_MENU = '[data-menu-material]'

/**
 * The field the drill-in focus must not reach on phones: the model pane's
 * search box. Scoped two ways — inside a host menu surface, or carrying the
 * model list's own `-models` control — so neither another menu's search field
 * nor a settings-page input ever matches.
 */
export const MODEL_SEARCHBOX =
  '[data-menu-material] input[role="searchbox"], input[role="searchbox"][aria-controls$="-models"]'

/** How long the shadow stays armed after the last tap while no menu is up. */
export const IDLE_DISARM_MS = 2_000

/** The element face the prototype shadow's `matches()` gate needs. */
export interface ModelMenuFocusElement {
  matches(selector: string): boolean
}

/** The prototype-shaped surface the guard patches. */
export interface ModelMenuFocusProto {
  focus: (...args: never[]) => void
}

/** The host surface the guard patches and reads, injectable for unit tests. */
export interface ModelMenuGuardHost {
  /** Patch target (real: `HTMLInputElement.prototype`). */
  proto: ModelMenuFocusProto
  /** Whether a host menu surface is currently in the document. */
  menuOpen: () => boolean
  /** Schedule the idle re-check (real: `window.setTimeout`). */
  later: (run: () => void, ms: number) => number
  /** Cancel a scheduled idle re-check (real: `window.clearTimeout`). */
  cancel: (id: number) => void
}

/** Reversible arm/disarm state machine; owns the prototype shadow's lifetime. */
export interface ModelMenuGuard {
  /** Whether the prototype shadow is currently installed. */
  readonly armed: boolean
  /** Install the shadow (idempotent). */
  arm(): void
  /** Remove the shadow and cancel any pending idle check (idempotent). */
  disarm(): void
  /** Capture-phase pointerdown entry: arm now, disarm on idle. */
  onPointerDown(): void
}

/**
 * Build the arm/disarm state machine over an injectable host surface.
 * @param host - prototype, menu probe and timer functions.
 * @returns the guard controller.
 */
export function createModelMenuGuard(host: ModelMenuGuardHost): ModelMenuGuard {
  /** The native method captured at arm time, so disarm restores exactly it. */
  let original: ModelMenuFocusProto['focus'] | null = null
  let idleTimer = 0

  const disarm = (): void => {
    host.cancel(idleTimer)
    idleTimer = 0
    if (original === null) return
    host.proto.focus = original
    original = null
  }

  const arm = (): void => {
    if (original !== null) return
    const previous = host.proto.focus
    original = previous
    const guarded = function (this: ModelMenuFocusElement, ...args: never[]): void {
      if (this.matches(MODEL_SEARCHBOX)) return
      previous.apply(this, args)
    }
    host.proto.focus = guarded as ModelMenuFocusProto['focus']
  }

  const onPointerDown = (): void => {
    // A tap is the moment before React can open the menu or drill into a pane,
    // so arm now; the check below only decides when to give the prototype
    // back, and a menu opened by this same gesture keeps it armed.
    arm()
    host.cancel(idleTimer)
    idleTimer = host.later(() => {
      if (!host.menuOpen()) disarm()
    }, IDLE_DISARM_MS)
  }

  return {
    get armed(): boolean {
      return original !== null
    },
    arm,
    disarm,
    onPointerDown,
  }
}

/**
 * Keep the model menu's search field from grabbing focus (and the soft
 * keyboard) by itself, on the mobile breakpoint only.
 * @param ctx - client root context.
 */
export function installModelMenuKeyboardGuard(ctx: ClientContext): void {
  installMobileEffect(ctx, 'dsh-maestro-mobile: model menu keyboard guard', () => {
    const guard = createModelMenuGuard({
      proto: HTMLInputElement.prototype,
      menuOpen: () => document.querySelector(HOST_MENU) !== null,
      later: (run, ms) => window.setTimeout(run, ms),
      cancel: (id) => window.clearTimeout(id),
    })
    const onPointerDown = (): void => {
      guard.onPointerDown()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      guard.disarm()
    }
  })
}

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { installMobileEffect } from './phone-chrome.ts'

const MARGIN = 12

function getSafeTop(): number {
  // env(safe-area-inset-top) is the notch / status-bar height. Fixed menus
  // at top:12 would render under the notch on iOS. Read the real inset via
  // a probe element so the clamp below pushes the menu below the notch.
  try {
    const probe = document.createElement('div')
    probe.style.position = 'fixed'
    probe.style.top = '0'
    probe.style.paddingTop = 'env(safe-area-inset-top, 0px)'
    probe.style.visibility = 'hidden'
    probe.style.pointerEvents = 'none'
    document.body.appendChild(probe)
    const v = parseFloat(getComputedStyle(probe).paddingTop) || 0
    probe.remove()
    return v
  } catch {
    return 0
  }
}

function isPortalMenu(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.getAttribute('role') !== 'menu') return false
  const cs = getComputedStyle(el)
  // Host Menu portal is position:fixed; non-portal is absolute inside a relative wrapper
  return cs.position === 'fixed'
}

function fixPortalMenus(): void {
  const safeTop = getSafeTop()
  const margin = MARGIN + safeTop
  const vh = window.innerHeight
  const vw = window.innerWidth
  const menus = document.querySelectorAll<HTMLElement>('div[role="menu"]')
  for (const menu of menus) {
    if (!isPortalMenu(menu)) continue
    // Only hero preset / workspace pickers are long — but clamp is safe for all portal menus
    const rect = menu.getBoundingClientRect()
    // Height may be 0 during hidden pre-render (visibility:hidden top:0) — skip then
    if (rect.height === 0 && menu.offsetHeight === 0) continue
    const h = menu.offsetHeight || rect.height
    const w = menu.offsetWidth || rect.width
    let top = rect.top
    let left = rect.left
    let needs = false
    // Correct the inverted clamp bug in Menu.tsx: Math.min(Math.max(y,MARGIN),vh-lh-MARGIN)
    // yields negative y when lh > vh-MARGIN. The host code measured lh from
    // calc(100vh) while vh is innerHeight (dynamic). Push back into the viewport.
    if (top < margin) {
      top = margin
      needs = true
    }
    if (h > 0 && top + h > vh - MARGIN) {
      // Prefer keeping the menu at the corrected top and let its internal
      // viewport scroll. If it still overflows, clamp top to fit.
      if (top + h > vh - MARGIN) {
        const clamped = Math.max(margin, vh - h - MARGIN)
        if (clamped < top) {
          top = clamped
          needs = true
        }
      }
    }
    if (w > 0) {
      if (left < MARGIN) {
        left = MARGIN
        needs = true
      }
      if (left + w > vw - MARGIN) {
        const clampedX = Math.max(MARGIN, vw - w - MARGIN)
        if (clampedX < left) {
          left = clampedX
          needs = true
        }
      }
    }
    if (needs) {
      menu.style.top = `${Math.round(top)}px`
      menu.style.left = `${Math.round(left)}px`
      // Ensure the menu never exceeds the dynamic viewport — dvh fallback
      // covers the CSS 100vh mismatch on mobile Safari.
      const maxH = vh - margin - MARGIN
      if (h > maxH) {
        menu.style.maxHeight = `calc(100dvh - ${margin + MARGIN}px)`
        // Fallback for engines without dvh
        if (getComputedStyle(menu).maxHeight === 'none' || menu.style.maxHeight.includes('dvh')) {
          // Keep the dvh value; CSS fallback below covers 100vh
        }
      }
    }
  }
}

/**
 * Fix the new-session hero preset dropdown on mobile: when the preset list
 * is long, the host Menu's clamp uses `Math.min(Math.max(y,MARGIN),vh-lh-MARGIN)`
 * which inverts when lh (100vh-24) > innerHeight-MARGIN and produces a negative
 * top, so the top presets are clipped above the viewport. On narrow viewports
 * this effect post-corrects any portal menu's fixed position back into the
 * 12px + safe-area margin and caps its max-height to the dynamic viewport.
 */
export function installHeroPresetMenuFix(ctx: ClientContext): void {
  installMobileEffect(ctx, 'dsh-maestro-mobile: hero preset menu viewport fix', () => {
    let raf = 0
    const schedule = () => {
      if (raf !== 0) return
      raf = requestAnimationFrame(() => {
        raf = 0
        fixPortalMenus()
      })
    }
    const mo = new MutationObserver(schedule)
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] })
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    // Also watch size changes of any open menu
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null
    const attachRo = () => {
      if (ro === null) return
      document.querySelectorAll('div[role="menu"]').forEach(el => {
        try { ro.observe(el) } catch {}
      })
    }
    attachRo()
    const roMo = new MutationObserver(attachRo)
    roMo.observe(document.body, { childList: true, subtree: true })
    // Run once on install in case a menu is already open (probe)
    schedule()
    return () => {
      if (raf !== 0) cancelAnimationFrame(raf)
      mo.disconnect()
      roMo.disconnect()
      ro?.disconnect()
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
    }
  })
}

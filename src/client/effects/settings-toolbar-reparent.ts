import type { ReconcilerTask } from '../core/reconciler-core.ts'

export function createSettingsToolbarTask(): ReconcilerTask {
  let origin: { parent: Node; next: Node | null } | null = null
  return {
    name: 'settings-toolbar-reparent',
    scopes: ['*'],
    ensure: () => {
      // On mobile (<1024) Settings is a bottom sheet with stacked nav (pill tabs)
      // + content column — the desktop reparent (header → nav) would break that
      // layout, so skip entirely on narrow viewports and restore if needed.
      if (window.matchMedia('(max-width: 1023px)').matches) {
        if (origin !== null) {
          const h = document.querySelector('[aria-modal="true"] [class*="_header"]:not([class*="_headerActions"])')
          if (h !== null && origin.parent.isConnected) origin.parent.insertBefore(h, origin.next)
          origin = null
        }
        return
      }
      const dialog = document.querySelector('[aria-modal="true"]')
      if (dialog === null) return
      const nav = dialog.querySelector(':scope > [class*="_nav"]')
      const header = dialog.querySelector('[class*="_header"]:not([class*="_headerActions"])')
      if (nav === null || header === null) return
      if (header.parentElement === nav) return
      // The dialog DOM can be rebuilt by React between mutations: refresh
      // the origin every time we actually move the header, so disposal
      // restores it where it currently belongs, not where it was first seen.
      if (header.parentElement !== null) {
        origin = { parent: header.parentElement, next: header.nextSibling }
      }
      nav.appendChild(header)
    },
    dispose: () => {
      if (origin === null) return
      const header = document.querySelector('[aria-modal="true"] [class*="_header"]:not([class*="_headerActions"])')
      if (header !== null && origin.parent.isConnected) {
        origin.parent.insertBefore(header, origin.next)
      }
      origin = null
    },
  }
}

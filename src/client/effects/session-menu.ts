/**
 * Session-row action-menu injection on touch-primary devices: adds a "delete
 * session" item to the host's per-row ⋯ menu (beside rename / fork / archive)
 * and drives the whole flow — row → session id resolution, a confirmation
 * dialog, the host delete route, and the list refresh.
 *
 * The host menu is React-owned with no extension slot, so the item is injected
 * into the portaled `[role="menu"]` list by cloning the host's own item markup
 * (reusing the hashed classes keeps the styling identical) and re-injected
 * whenever React recreates the menu. The host menu is identified by its own
 * contents — exactly the three workspace items — so no other menu is touched.
 *
 * Row → session id is by display title, because rows carry no id in the DOM.
 * When two visible sessions share a title the owning workspace disambiguates;
 * if the title is still ambiguous the flow REFUSES and shows an error, because
 * deleting the wrong session is unrecoverable and a positional guess is not
 * worth that risk.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { MOBILE_QUERY, TOUCH_QUERY, getFrame, installMobileEffect } from './phone-chrome.ts'

// The custom client bundler cannot resolve `../` requires from
// src/client/effects, so these mirror their sources. Keep in sync.
/** Locale namespace (src/client/i18n/locales.ts). */
const NS = 'mobileNav'
/** The ui-workspace dictionary namespace the host menu labels come from. */
const WORKSPACE_NS = 'workspace'
/** Host delete route (src/index.ts DELETE_ROUTE_PATH). */
const DELETE_ROUTE_PATH = '/api/mobile-nav.session.delete'

/** Marker on the injected menu item (idempotence across React re-renders). */
const DELETE_ITEM_MARKER = 'data-mobile-nav="session-delete"'
/** Danger accent read from the theme, with a fixed fallback. */
const DANGER_COLOR = 'var(--dsw-alias-state-error-primary, #b91c1c)'
/** 16px outline trash glyph (IconTrashOutline16 path), currentColor-filled. */
const TRASH_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">'
  + '<path d="M6.5 1.5C6.09 1.5 5.75 1.84 5.75 2.25V3H3.25C2.84 3 2.5 3.34 2.5 3.75C2.5 4.16 2.84 4.5 3.25 4.5H3.6L4.2 13.1C4.24 13.75 4.78 14.25 5.43 14.25H10.57C11.22 14.25 11.76 13.75 11.8 13.1L12.4 4.5H12.75C13.16 4.5 13.5 4.16 13.5 3.75C13.5 3.34 13.16 3 12.75 3H10.25V2.25C10.25 1.84 9.91 1.5 9.5 1.5H6.5ZM7 3H9V4.5H7V3ZM5.11 5.6H10.89L10.32 12.85H5.68L5.11 5.6Z" fill="currentColor"/></svg>'

/** Minimal session-list row face this module reads (client projection). */
export interface SessionEntryLike {
  id: string
  /** Durable log-backed title, absent until the host projects one. */
  title?: string
  /** Human-facing label rendered by the sidebar row: title, path basename, id. */
  displayTitle?: string
  cwd?: string
  blank?: boolean
  origin?: string
}

/** Minimal session-list snapshot face (`ctx.sessions.list.getSnapshot()`). */
export interface SessionsSnapshotLike {
  ids: readonly string[]
  byId: Readonly<Record<string, SessionEntryLike | undefined>>
  current?: string
}

/** Minimal workspace row face. */
interface WorkspaceLike {
  title: string
  path: string
  sessionIds: readonly string[]
}

/** Minimal workspace snapshot face. */
export interface WorkspacesSnapshotLike {
  items: readonly WorkspaceLike[]
  archivedSessionIds: readonly string[]
}

/** Everything the row → session resolution reads (pure, unit-tested). */
export interface SessionMenuInput {
  /** The row's rendered title. */
  rowTitle: string
  /** The owning group section's title, when the row sits in one. */
  groupTitle: string | undefined
  sessions: SessionsSnapshotLike
  workspaces: WorkspacesSnapshotLike
}

/**
 * Resolve one row to its session id.
 * @param input - the row title, its group title, and both snapshots.
 * @returns the session id, or undefined when the row cannot be resolved with
 * certainty (unknown title, or an ambiguous duplicate).
 */
export function resolveSessionId(input: SessionMenuInput): string | undefined {
  const archived = new Set(input.workspaces.archivedSessionIds)
  // Host generations differ in what the plugin-facing snapshot carries: the
  // client projection exposes `ids` + `byId`, while a manager-level snapshot
  // exposes `items`. Read both so the flow cannot break on a shape change.
  const raw = input.sessions as SessionsSnapshotLike & { items?: readonly SessionEntryLike[] }
  const byId: Readonly<Record<string, SessionEntryLike | undefined>> = raw.byId
    ?? Object.fromEntries((raw.items ?? []).map((entry) => [entry.id, entry]))
  const ids: readonly string[] = Array.isArray(raw.ids) ? raw.ids : Object.keys(byId)
  // Rows carry no id in the DOM, so the row's rendered label is the key. The
  // sidebar renders `displayTitle` (durable title, else the project basename,
  // else the id), so that is what the row's text holds.
  const candidates = ids.filter((id) => {
    const entry = byId[id]
    if (entry === undefined) return false
    if (entry.blank === true) return false
    if (entry.origin === 'subagent') return false
    if (archived.has(id)) return false
    return (entry.displayTitle ?? entry.title ?? '') === input.rowTitle
  })
  const only = candidates.length === 1 ? candidates[0] : undefined
  if (only !== undefined) return only
  if (candidates.length === 0) return undefined

  // Duplicate titles: the owning workspace disambiguates. Never fall back to a
  // positional guess — the caller turns an unresolved row into a visible error.
  const workspace = input.workspaces.items.find((item) => item.title === input.groupTitle)
  if (workspace === undefined) return undefined
  const scoped = candidates.filter((id) =>
    workspace.sessionIds.includes(id) || byId[id]?.cwd === workspace.path,
  )
  return scoped.length === 1 ? scoped[0] : undefined
}

/** One captured session-row menu anchor. */
interface MenuAnchor {
  button: HTMLButtonElement
  row: HTMLElement
  title: string
}

/** Host delete-endpoint response shape. */
interface DeleteResponse {
  ok?: true
  deleted?: string
  error?: { code?: string; message?: string }
}

/**
 * Install the mobile session-delete machinery. Armed on TOUCH_QUERY — touch
 * primary at EVERY width — so a large tablet in landscape keeps the desktop
 * layout but still gets the item, while mouse-driven or pointer-less windows
 * stay a complete no-op.
 * @param ctx - client root context.
 */
export function installSessionMenuDelete(ctx: ClientContext): void {
  installMobileEffect(ctx, 'dsh-maestro-mobile: session menu delete', () => {
    const navT = (key: string, params?: Record<string, unknown>): string =>
      (ctx.locale.bind(NS) as (k: string, p?: Record<string, unknown>) => string)(key, params)
    const wsT = (key: string): string =>
      (ctx.locale.bind(WORKSPACE_NS) as (k: string) => string)(key)

    let anchor: MenuAnchor | null = null
    let injectRaf = 0
    let dialogHost: { backdrop: HTMLElement; card: HTMLElement } | null = null
    let closeDialogOnKey: ((event: KeyboardEvent) => void) | null = null

    const closeDialog = (): void => {
      if (closeDialogOnKey !== null) {
        document.removeEventListener('keydown', closeDialogOnKey, true)
        closeDialogOnKey = null
      }
      if (dialogHost !== null) {
        dialogHost.backdrop.remove()
        dialogHost.card.remove()
        dialogHost = null
      }
    }

    /** Build the modal shell every dialog state shares. */
    const openDialog = (): { card: HTMLElement; body: HTMLElement; error: HTMLElement } => {
      closeDialog()
      const frame = getFrame() ?? document.body
      const backdrop = document.createElement('div')
      backdrop.dataset.mobileNav = 'delete-dialog-backdrop'
      const card = document.createElement('div')
      card.dataset.mobileNav = 'delete-dialog'
      card.setAttribute('role', 'dialog')
      card.setAttribute('aria-modal', 'true')
      const title = document.createElement('div')
      title.dataset.mobileNav = 'delete-confirm-title'
      const body = document.createElement('div')
      body.dataset.mobileNav = 'delete-confirm-desc'
      const error = document.createElement('div')
      error.dataset.mobileNav = 'delete-error'
      error.setAttribute('role', 'alert')
      error.hidden = true
      const actions = document.createElement('div')
      actions.dataset.mobileNav = 'delete-confirm-actions'
      card.append(title, body, error, actions)
      const onKey = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') closeDialog()
      }
      document.addEventListener('keydown', onKey, true)
      closeDialogOnKey = onKey
      backdrop.addEventListener('click', closeDialog)
      frame.append(backdrop, card)
      dialogHost = { backdrop, card }
      return { card, body, error }
    }

    const button = (label: string, marker: string): HTMLButtonElement => {
      const element = document.createElement('button')
      element.type = 'button'
      element.dataset.mobileNav = marker
      element.textContent = label
      return element
    }

    /** Show a confirmation dialog for one resolved session. */
    const showDeleteDialog = (sessionId: string, title: string): void => {
      const { card, body, error } = openDialog()
      const heading = card.querySelector<HTMLElement>('[data-mobile-nav="delete-confirm-title"]')
      if (heading !== null) heading.textContent = navT('deleteConfirmTitle')
      body.textContent = navT('deleteConfirmDesc', { title })
      const actions = card.querySelector<HTMLElement>('[data-mobile-nav="delete-confirm-actions"]')
      const no = button(navT('deleteConfirmNo'), 'delete-confirm-no')
      const yes = button(navT('deleteConfirmYes'), 'delete-confirm-yes')
      no.addEventListener('click', closeDialog)
      actions?.append(no, yes)

      const fail = (message: string): void => {
        error.textContent = message
        error.hidden = false
        yes.disabled = false
        no.disabled = false
        yes.textContent = navT('deleteConfirmYes')
      }
      const mapError = (payload: DeleteResponse | null, reason: unknown): string => {
        const code = payload?.error?.code
        if (code === 'session-not-found') return navT('deleteErrorNotFound')
        if (code === 'session-busy') return navT('deleteErrorBusy')
        const message = payload?.error?.message ?? (reason instanceof Error ? reason.message : String(reason))
        return navT('deleteErrorGeneric', { message })
      }

      yes.addEventListener('click', () => {
        void (async () => {
          yes.disabled = true
          no.disabled = true
          yes.textContent = navT('deletePending')
          error.hidden = true
          const sessions = ctx.sessions as unknown as {
            list: { getSnapshot(): SessionsSnapshotLike }
            clear(): void
            refresh?: () => Promise<void>
          }
          const wasCurrent = sessions.list.getSnapshot().current === sessionId
          try {
            const response = await fetch(DELETE_ROUTE_PATH, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId }),
            })
            const payload = await response.json().catch(() => null) as DeleteResponse | null
            if (!response.ok || payload === null || payload.ok !== true) {
              fail(mapError(payload, new Error(`HTTP ${response.status}`)))
              return
            }
          } catch (reason) {
            fail(mapError(null, reason))
            return
          }
          closeDialog()
          if (wasCurrent) sessions.clear()
          // Must be called AS A METHOD on ctx.sessions: refresh() reads its own
          // manager, and an extracted reference would throw.
          await sessions.refresh?.()
          if (wasCurrent && window.matchMedia(MOBILE_QUERY).matches) ctx.layout.toggleSidebar()
        })()
      })
    }

    /** Show a non-destructive error card (nothing was deleted). */
    const showError = (message: string): void => {
      const { card, body, error } = openDialog()
      const heading = card.querySelector<HTMLElement>('[data-mobile-nav="delete-confirm-title"]')
      if (heading !== null) heading.textContent = navT('deleteSession')
      body.textContent = ''
      error.textContent = message
      error.hidden = false
      const actions = card.querySelector<HTMLElement>('[data-mobile-nav="delete-confirm-actions"]')
      const close = button(navT('deleteConfirmNo'), 'delete-confirm-no')
      close.addEventListener('click', closeDialog)
      actions?.append(close)
    }

    /** Whether a menu list is the host's per-session row menu. */
    const isSessionMenu = (menu: HTMLElement): boolean => {
      const labels = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')]
        .map((element) => (element.textContent ?? '').trim())
      const rename = wsT('rename')
      const fork = wsT('menu.fork')
      const archive = wsT('menu.archiveSession')
      return labels.length === 3 && labels.includes(rename) && labels.includes(fork) && labels.includes(archive)
    }

    /** Inject the delete item into one open session menu (idempotent). */
    const injectInto = (menu: HTMLElement): void => {
      if (menu.querySelector(`[${DELETE_ITEM_MARKER}]`) !== null) return
      const template = menu.querySelector<HTMLElement>('[role="menuitem"]')
      if (template === null) return
      const wrap = template.parentElement
      if (wrap === null) return
      const viewport = menu.querySelector<HTMLElement>('[class*="_viewport"]') ?? menu
      const clone = wrap.cloneNode(true) as HTMLElement
      const item = clone.querySelector<HTMLButtonElement>('[role="menuitem"]')
      if (item === null) return
      const icon = item.querySelector<HTMLElement>('[class*="_itemIcon"]')
      if (icon !== null) {
        icon.innerHTML = TRASH_SVG
        icon.style.color = DANGER_COLOR
      }
      const label = item.querySelector<HTMLElement>('[class*="_itemLabel"]')
      if (label !== null) {
        label.textContent = navT('deleteSession')
        label.style.color = DANGER_COLOR
      }
      item.setAttribute('data-mobile-nav', 'session-delete')
      item.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        const captured = anchor
        // Close the React-owned host menu by re-toggling its anchor.
        captured?.button.click()
        try {
          if (captured === null) {
            showError(navT('deleteErrorResolve'))
            return
          }
          const sessions = ctx.sessions as unknown as { list: { getSnapshot(): SessionsSnapshotLike } }
          const workspaces = ctx.workspaces as unknown as { list: { getSnapshot(): WorkspacesSnapshotLike } }
          const sessionId = resolveSessionId({
            rowTitle: captured.title,
            groupTitle: groupTitleOf(captured.row),
            sessions: sessions.list.getSnapshot(),
            workspaces: workspaces.list.getSnapshot(),
          })
          if (sessionId === undefined) {
            showError(navT('deleteErrorResolve'))
            return
          }
          showDeleteDialog(sessionId, captured.title)
        } catch (reason) {
          // Never fail silently: surface internal errors instead of leaving the
          // tap with no visible result.
          console.error('[dsh-maestro-mobile] session delete failed:', reason)
          showError(navT('deleteErrorGeneric', {
            message: reason instanceof Error ? reason.message : String(reason),
          }))
        }
      })
      viewport.append(clone)
    }

    /** The row's group section title, when it has one. */
    const groupTitleOf = (row: HTMLElement): string | undefined => {
      const group = row.closest<HTMLElement>('[class*="_groupSection"]')
      if (group === null) return undefined
      const header = group.querySelector<HTMLElement>('[class*="_projectRow"] [class*="_title"]')
        ?? group.querySelector<HTMLElement>('[class*="_title"]')
      const text = header?.textContent?.trim()
      return text === undefined || text === '' ? undefined : text
    }

    const injectAll = (): void => {
      for (const menu of document.querySelectorAll<HTMLElement>('[role="menu"]')) {
        if (isSessionMenu(menu)) injectInto(menu)
      }
    }
    const scheduleInject = (): void => {
      if (injectRaf !== 0) return
      injectRaf = requestAnimationFrame(() => {
        injectRaf = 0
        injectAll()
      })
    }

    // Capture the row's action button before React handles the click, so the
    // row and title are known when the portaled menu appears.
    const onDocumentClick = (event: MouseEvent): void => {
      const target = event.target as HTMLElement | null
      if (target === null || typeof target.closest !== 'function') return
      const row = target.closest<HTMLElement>('[class*="_sessionRow"]')
      if (row === null) return
      const actionButton = row.querySelector<HTMLButtonElement>('button')
      if (actionButton === null) return
      const title = row.querySelector<HTMLElement>('[class*="_title"]')?.textContent?.trim() ?? ''
      anchor = { button: actionButton, row, title }
      scheduleInject()
    }
    document.addEventListener('click', onDocumentClick, true)

    // React recreates the menu on every open, so the injected node must follow.
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type !== 'childList') continue
        const target = record.target
        if (target === document.body) {
          scheduleInject()
          break
        }
        if (target instanceof HTMLElement
          && (target.matches('[role="menu"]') || target.closest('[role="menu"]') !== null)) {
          scheduleInject()
          break
        }
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })

    injectAll()
    return () => {
      document.removeEventListener('click', onDocumentClick, true)
      observer.disconnect()
      if (injectRaf !== 0) cancelAnimationFrame(injectRaf)
      closeDialog()
      anchor = null
    }
  }, TOUCH_QUERY)
}

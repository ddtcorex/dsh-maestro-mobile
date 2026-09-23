import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconDownload } from '../core/icon-compat.ts'
import { NS } from '../i18n/locales.ts'

/** Full props for the sidebar footer action entry. */
export interface MobileDrawerFooterProps extends PropsRuntime<'sidebar.footer.action'>, PropsLocale<typeof NS> {
  /** Bound ctx.sessionLogDownload.download() for the current session. */
  downloadSessionLog: (sessionId: string) => void
}

/**
 * Mobile-only drawer footer actions, relocated from the session header to the
 * drawer footer (beside Settings):
 * - Session log: the official session-log-export controller, so the
 *   progress/result dialog is shared with the desktop flow.
 * (The Files / explorer entry was removed — it duplicated the header action
 *  and is not reachable from the mobile drawer.)
 * Hidden entirely on wide screens (CSS media query).
 */
export function MobileDrawerFooter({ useSessions, downloadSessionLog, t }: MobileDrawerFooterProps) {
  // 0.1.6 removed SessionListState.current: the open session is the one the
  // main view retains (same derivation as the workspace tree's mainSessionId).
  const sessionId = useSessions((state) => Object.values(state.byId).find((session) => (session.retainedBy.mainView ?? 0) > 0)?.id)
  return (
    <div data-mobile-nav="drawer-actions">
      <button
        type="button"
        data-mobile-nav="session-log"
        aria-label={t('sessionLog')}
        title={t('sessionLog')}
        disabled={sessionId === undefined}
        onClick={() => {
          if (sessionId !== undefined) downloadSessionLog(sessionId)
        }}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 12px', borderRadius: 999, border: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', font: 'var(--dsw-font-xs-13)', cursor: 'pointer', opacity: sessionId === undefined ? 0.5 : 1 } as any}
      >
        <IconDownload size={14} />
        <span>{t('sessionLog')}</span>
      </button>
    </div>
  )
}

import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconPanelLeftOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { NS } from '../i18n/locales.ts'

/** Full props for the session-header directory toggle. */
export interface MobileNavToggleProps extends PropsRuntime<'conversation.session.header.actions'>, PropsLocale<typeof NS> {
  /** Bound ctx.layout.toggleSidebar(). */
  toggleSidebar: () => void
}

/**
 * Mobile-only icon button next to the session title:
 * - toggle: opens the directory drawer on narrow screens.
 * (The explorer / Files sheet is intentionally not reachable from this
 *  header on mobile — the redundant two-tap Files entries were removed.)
 * Hidden entirely on wide screens (CSS media query).
 */
export function MobileNavToggle({ toggleSidebar, t }: MobileNavToggleProps) {
  return (
    <button
      type="button"
      data-mobile-nav="toggle"
      aria-label={t('open')}
      title={t('open')}
      onClick={() => toggleSidebar()}
    >
      <IconPanelLeftOutline16 size={16} />
    </button>
  )
}

import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { NS } from '../i18n/locales.ts';
/** Full props for the session-header directory toggle. */
export interface MobileNavToggleProps extends PropsRuntime<'conversation.session.header.actions'>, PropsLocale<typeof NS> {
    /** Bound ctx.layout.toggleSidebar(). */
    toggleSidebar: () => void;
}
/**
 * Mobile-only icon button next to the session title:
 * - toggle: opens the directory drawer on narrow screens.
 * (The explorer / Files sheet is intentionally not reachable from this
 *  header on mobile — the redundant two-tap Files entries were removed.)
 * Hidden entirely on wide screens (CSS media query).
 */
export declare function MobileNavToggle({ toggleSidebar, t }: MobileNavToggleProps): import("react").JSX.Element;
//# sourceMappingURL=MobileNavToggle.d.ts.map
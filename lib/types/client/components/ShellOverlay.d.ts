import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { NS } from '../i18n/locales.ts';
export interface ShellOverlayProps extends PropsRuntime<'shell.overlay'>, PropsLocale<typeof NS> {
    toggleSidebar: () => void;
}
/**
 * DSH-native shell overlay: backdrop + FAB rendered inside AppFrame's
 * overlayLayer (z20, pointer-events auto per child). Reuses DSH's
 * overlay container instead of manual frame.appendChild.
 * Drawer open state reads the same data-sidebar-collapsed that AppFrame owns.
 * @param props - overlay props.
 */
export declare function ShellOverlay({ toggleSidebar, t }: ShellOverlayProps): import("react").JSX.Element | null;
//# sourceMappingURL=ShellOverlay.d.ts.map
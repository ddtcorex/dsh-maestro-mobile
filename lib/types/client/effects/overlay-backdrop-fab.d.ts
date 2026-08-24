/**
 * Fix for dsh-better-sidebar (npm: dsh-better-sidebar): mobile overrides for
 * the right workbench panel that would otherwise cover chat at 100vw with no
 * backdrop. This module provides the left-drawer backdrop/FAB and the
 * right-panel backdrop task. JS is required because the panel host has
 * pointer-events:none and the panel open state is driven by hashed classes.
 */
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { ReconcilerTask } from '../core/reconciler-core.ts';
export declare function createOverlayTask(t: TranslateNS<'mobileNav'>, toggleSidebar: () => void): ReconcilerTask;
/**
 * Fix for dsh-better-sidebar — right-panel backdrop task on mobile.
 * Creates a tappable dimmed layer inside [data-dsh-panel-host] (z-index 39)
 * below the panel (z 40) so chat is not silently hidden behind the 92vw
 * drawer. Host has pointer-events:none, so backdrop must re-enable it.
 */
export declare function createRightPanelBackdropTask(t: TranslateNS<'mobileNav'>): ReconcilerTask;
//# sourceMappingURL=overlay-backdrop-fab.d.ts.map
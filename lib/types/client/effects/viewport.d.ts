import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
/**
 * Viewport + theme-color bridge: reuses DSH ThemePresenter where possible.
 * On narrow screens: viewport-fit=cover so env(safe-area-inset-*) is real;
 * theme-color tracks body background via DSH's theme/change event when
 * available, falling back to getComputedStyle.
 * @param ctx - client root context.
 */
export declare function installViewportBridge(ctx: ClientContext): void;
//# sourceMappingURL=viewport.d.ts.map
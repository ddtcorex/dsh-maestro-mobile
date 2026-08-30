import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
/**
 * Layout bridge: reuses DSH's own breakpoint (SIDEBAR_AUTO_COLLAPSE=1024)
 * instead of duplicating it. Observes the layout store indirectly via
 * matchMedia + frame marker, so drawer state stays in sync with AppFrame's
 * narrow detection. Keeps data-mobile-nav="frame" as a compat marker for
 * existing CSS while the style migration completes.
 * @param ctx - client root context.
 */
export declare function installLayoutBridge(ctx: ClientContext): void;
//# sourceMappingURL=layout-bridge.d.ts.map
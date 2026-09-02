import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
/**
 * Fix the new-session hero preset dropdown on mobile: when the preset list
 * is long, the host Menu's clamp uses `Math.min(Math.max(y,MARGIN),vh-lh-MARGIN)`
 * which inverts when lh (100vh-24) > innerHeight-MARGIN and produces a negative
 * top, so the top presets are clipped above the viewport. On narrow viewports
 * this effect post-corrects any portal menu's fixed position back into the
 * 12px + safe-area margin and caps its max-height to the dynamic viewport.
 */
export declare function installHeroPresetMenuFix(ctx: ClientContext): void;
//# sourceMappingURL=preset-menu-fix.d.ts.map
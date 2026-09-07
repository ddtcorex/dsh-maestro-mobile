import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
/**
 * Decide whether a touch-originated mousedown on `target` should be stopped
 * before React's `onMouseDown` (upstream `keepFocus`).
 * @param target - the mousedown event target.
 * @returns true when the target is a composer toolbar button whose keepFocus
 * must be suppressed; false for @ trigger-menu picks, non-buttons, and
 * anything outside the composer capsule.
 */
export declare function shouldSuppressComposerMousedown(target: Element): boolean;
export declare function installComposerKeyboardTouch(ctx: ClientContext): void;
//# sourceMappingURL=composer-keyboard-touch.d.ts.map
window.__ModuleLoader__.load({ id: "@ddtcorex/dsh-maestro-mobile", factory: (require) => {
var __modules = {};
__modules["core/reconciler-core.js"] = function (require, module, exports) {
"use strict";
// reconciler-core.ts — DOM-free reconciler engine shared by every mobile DOM
// reconciler task. Deliberately has ZERO import statements:
//  - the custom client bundler cannot resolve `../` requires from
//    src/client/effects, and a file without imports has nothing to resolve;
//  - node:test imports it directly (Node's native type stripping) without a
//    DOM or DSH runtime, so registration / dirty routing / coalescing /
//    error-isolation can be covered by plain unit tests.
//
// The browser half (phone-chrome.ts) is a thin adapter: it owns the
// MutationObserver and requestAnimationFrame scheduler, feeds mutation keys
// into `note()`, and delegates task lifecycle to `register()` /
// `activate()` / `deactivate()`. `scopes` are opaque dirty keys — the core
// never interprets them (an attribute name like 'data-sidebar-collapsed' or
// the tree sentinel '*').
Object.defineProperty(exports, "__esModule", { value: true });
exports.createReconcilerCore = createReconcilerCore;
function createReconcilerCore(options) {
    const onError = options.onError ??
        ((taskName, error, phase) => {
            console.error(`[dsh-maestro-mobile] reconciler task ${taskName}${phase === 'dispose' ? ' dispose' : ''} failed`, error);
        });
    const registered = new Set();
    let active = null;
    let dirty = new Set();
    let forceAll = false;
    let pending = null;
    const runEnsure = (task) => {
        try {
            task.ensure();
        }
        catch (error) {
            onError(task.name, error, 'ensure');
        }
    };
    const runDispose = (task) => {
        try {
            task.dispose();
        }
        catch (error) {
            onError(task.name, error, 'dispose');
        }
    };
    const flush = () => {
        if (pending !== null) {
            pending();
            pending = null;
        }
        if (active === null) {
            dirty.clear();
            forceAll = false;
            return;
        }
        if (forceAll) {
            for (const task of active)
                runEnsure(task);
        }
        else if (dirty.size > 0) {
            for (const task of active) {
                const scopes = task.scopes;
                if (scopes === undefined || scopes.some((key) => dirty.has(key)))
                    runEnsure(task);
            }
        }
        dirty.clear();
        forceAll = false;
    };
    const schedule = () => {
        if (pending !== null)
            return;
        pending = options.requestFrame(() => {
            pending = null;
            flush();
        });
    };
    const register = (task) => {
        registered.add(task);
        if (active !== null) {
            active.add(task);
            runEnsure(task);
        }
        return () => {
            registered.delete(task);
            if (active !== null) {
                active.delete(task);
                runDispose(task);
            }
        };
    };
    const activate = () => {
        if (active !== null)
            return;
        active = new Set(registered);
        forceAll = true;
        flush();
    };
    const deactivate = () => {
        if (pending !== null) {
            pending();
            pending = null;
        }
        dirty.clear();
        forceAll = false;
        if (active !== null) {
            const snapshot = active;
            active = null;
            for (const task of snapshot)
                runDispose(task);
        }
    };
    return {
        get size() {
            return registered.size;
        },
        register,
        activate,
        deactivate,
        note: (keys) => {
            for (const key of keys)
                dirty.add(key);
            schedule();
        },
        flush,
    };
}
};
__modules["effects/aionui-compat.js"] = function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.installAionuiCompat = installAionuiCompat;
exports.createPreviewCloseTask = createPreviewCloseTask;
exports.createSheetRiseTask = createSheetRiseTask;
const phone_chrome_ts_1 = require("./effects/phone-chrome.js");
/** dsh-web-ui 兼容：explorer / preview 列的显隐标记与升起动画（同域同机制，合并一处）。 */
function installAionuiCompat(ctx) {
    (0, phone_chrome_ts_1.installMobileEffect)(ctx, 'dsh-maestro-mobile: aionui explorer close marker', () => {
        const onChevronClick = (event) => {
            const target = event.target;
            if (target === null || !target.closest('.aionui-collapse-chevron'))
                return;
            (0, phone_chrome_ts_1.getFrame)()?.removeAttribute('data-aionui-explorer-open');
        };
        document.addEventListener('click', onChevronClick, true);
        return () => document.removeEventListener('click', onChevronClick, true);
    });
    (0, phone_chrome_ts_1.installMobileEffect)(ctx, 'dsh-maestro-mobile: preview sheet open marker', () => {
        const closePreview = () => {
            (0, phone_chrome_ts_1.getFrame)()?.removeAttribute('data-aionui-preview-open');
            (0, phone_chrome_ts_1.getFrame)()?.removeAttribute('data-mobile-preview-full');
        };
        // Temporarily spoof platform/userAgent/appVersion to Win32 desktop to
        // bypass the suite's Android check. The spoof is global, so it must be
        // restore-safe: one in-flight timer, re-entrancy guarded, and always
        // restored on effect disposal (narrow→wide / plugin reload).
        const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        const DESKTOP_APPVERSION = '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        let restoreTimer = null;
        let spoofed = false;
        let originalPlatform = navigator.platform;
        let originalUserAgent = navigator.userAgent;
        let originalAppVersion = navigator.appVersion;
        const restoreNavigator = () => {
            if (restoreTimer !== null) {
                window.clearTimeout(restoreTimer);
                restoreTimer = null;
            }
            if (!spoofed)
                return;
            spoofed = false;
            Object.defineProperty(navigator, 'platform', { value: originalPlatform, configurable: true });
            Object.defineProperty(navigator, 'userAgent', { value: originalUserAgent, configurable: true });
            Object.defineProperty(navigator, 'appVersion', { value: originalAppVersion, configurable: true });
        };
        const spoofDesktop = () => {
            if (!spoofed) {
                originalPlatform = navigator.platform;
                originalUserAgent = navigator.userAgent;
                originalAppVersion = navigator.appVersion;
                Object.defineProperty(navigator, 'platform', { value: 'Win32', configurable: true });
                Object.defineProperty(navigator, 'userAgent', { value: DESKTOP_UA, configurable: true });
                Object.defineProperty(navigator, 'appVersion', { value: DESKTOP_APPVERSION, configurable: true });
                spoofed = true;
            }
            if (restoreTimer !== null)
                window.clearTimeout(restoreTimer);
            restoreTimer = window.setTimeout(restoreNavigator, 1000);
        };
        const onTap = (event) => {
            const target = event.target;
            if (target === null)
                return;
            const row = target.closest('[data-aionui-explorer-col] [class*="_treeRow"]');
            if (row === null)
                return;
            if (row.querySelector('[class*="_treeArrow"]:not([class*="_treeArrowEmpty"])') !== null)
                return;
            spoofDesktop();
            (0, phone_chrome_ts_1.getFrame)()?.setAttribute('data-aionui-preview-open', '');
        };
        const onCollapse = (event) => {
            const target = event.target;
            if (target === null)
                return;
            if (target.closest('[data-aionui-preview-col] [class*="_panelCollapse"]') !== null) {
                closePreview();
            }
        };
        document.addEventListener('click', onTap, true);
        document.addEventListener('click', onCollapse, true);
        return () => {
            restoreNavigator();
            document.removeEventListener('click', onTap, true);
            document.removeEventListener('click', onCollapse, true);
        };
    });
}
function createPreviewCloseTask() {
    return {
        name: 'preview-close-sync',
        // Only acts when the suite hides the col via inline style. Deliberately
        // NOT scoped to data-aionui-preview-open: our own open marker is set
        // before the suite necessarily flips its inline visibility, so waking on
        // that marker would read the still-hidden style as a "suite close" and
        // immediately undo the file-row tap.
        scopes: ['style'],
        ensure: () => {
            const pv = document.querySelector('[data-aionui-preview-col]');
            if (pv === null)
                return;
            if (pv.style.visibility === 'hidden') {
                (0, phone_chrome_ts_1.getFrame)()?.removeAttribute('data-aionui-preview-open');
                (0, phone_chrome_ts_1.getFrame)()?.removeAttribute('data-mobile-preview-full');
            }
        },
        dispose: () => { },
    };
}
function createSheetRiseTask() {
    const cols = ['[data-aionui-explorer-col]', '[data-aionui-preview-col]'];
    const seen = new Map();
    const play = (el) => {
        el.animate([
            { opacity: 0, transform: 'translateY(28px)' },
            { opacity: 1, transform: 'none' },
        ], { duration: 280, easing: 'cubic-bezier(.16, 1, .3, 1)', fill: 'backwards' });
    };
    return {
        name: 'sheet-rise-replay',
        // The flush runs on the next frame, by which time React has rendered the
        // opened col, so the frame markers / inline style / class changes are
        // reliable triggers — no '*'.
        scopes: [
            'style',
            'class',
            'data-aionui-explorer-open',
            'data-aionui-preview-open',
            'data-mobile-preview-full',
        ],
        ensure: () => {
            for (const sel of cols) {
                const el = document.querySelector(sel);
                if (el === null)
                    continue;
                const visible = getComputedStyle(el).visibility === 'visible';
                const prev = seen.get(sel) ?? false;
                if (visible && !prev)
                    play(el);
                seen.set(sel, visible);
            }
        },
        dispose: () => {
            seen.clear();
        },
    };
}
};
__modules["effects/stats-line.js"] = function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.statsAnchorAlive = statsAnchorAlive;
exports.createStatsLineTask = createStatsLineTask;
// The official conversation status row (turns / steps / LLM time / TTFT /
// cache) has a hashed class, so the stylesheet cannot target it directly.
// Mark the exact row on narrow screens by text: a [class*=_root] that
// carries the metrics text and no textarea (the composer card also ends in
// _root and can mention turns in its model line). The CSS then lays the
// marked row out as ONE horizontally scrolling line with every metric
// reachable.
// Fast-path predicate: is the previously marked strip still alive in place?
// Re-verifying one anchor per flush is O(1); the full-tree hunt in mark()
// grows with the conversation and runs on every streaming token.
function statsAnchorAlive(el) {
    if (el === null || !el.isConnected)
        return false;
    if (el.closest('[data-phase]') === null)
        return false;
    return el.closest('[class*="_composerStack"]') !== null;
}
function createStatsLineTask() {
    // The composer root renders the TPS readout ("TPS 89.4 tok/s") as its
    // own row BELOW the status strip; fold it into the strip so every
    // metric scrolls together. The suite re-renders its own tree, so this
    // must be idempotent and re-run on every mutation. Where the readout
    // came from is recorded so disposal can put it back — on a
    // narrow→wide transition the desktop layout must be the official one
    // again, and `[data-mobile-nav="stats"]` is not covered by the
    // desktop hide rules.
    let tpsOrigin = null;
    const moveTps = (stats) => {
        if ([...stats.children].some((c) => /^TPS\s+\d/.test((c.textContent ?? '').trim())))
            return;
        const stack = stats.closest('[class*="_composerStack"]');
        if (stack === null)
            return;
        for (const el of stack.querySelectorAll('div')) {
            const text = (el.textContent ?? '').trim();
            if (!/^TPS\s+\d/.test(text))
                continue;
            if (el.children.length > 0)
                continue;
            // The composer stack can be rebuilt by React between mutations:
            // refresh the origin every time we actually move the TPS readout, so
            // disposal returns it where it currently belongs.
            if (el.parentElement !== null) {
                tpsOrigin = { parent: el.parentElement, next: el.nextSibling };
            }
            stats.appendChild(el);
            return;
        }
    };
    const mark = () => {
        // Fast path: the marked strip usually survives React rebuilds between
        // tokens; re-verifying the anchor is O(1) while the full-tree hunt below
        // grows with the conversation. moveTps still re-runs so a rebuilt TPS
        // readout is re-folded.
        const anchor = document.querySelector('[data-mobile-nav="stats"]');
        if (anchor !== null && statsAnchorAlive(anchor)) {
            moveTps(anchor);
            return;
        }
        // Stale marker on a node that left the composer stack/phase context:
        // drop it so the slow path can re-anchor cleanly.
        anchor?.removeAttribute('data-mobile-nav');
        for (const root of document.querySelectorAll('[data-phase] [class*="_root"]')) {
            // The status row lives inside the composer stack; message-area
            // blocks can also mention turns/steps and must be skipped.
            if (root.closest('[class*="_composerStack"]') === null)
                continue;
            // The todo plan strip also lives in the composer stack and its root
            // ends in _root. Its items may legitimately contain "步"/"steps" in
            // their text, so never mistake it (or any interactive dock panel)
            // for the stats strip.
            if (root.matches('[data-testid="todo-panel"]'))
                continue;
            if (root.querySelector('button') !== null)
                continue;
            const text = root.textContent ?? '';
            if (!/(turns|steps|\bLLM\b|轮|步)/.test(text))
                continue;
            if (root.querySelector('textarea') !== null)
                continue;
            root.setAttribute('data-mobile-nav', 'stats');
            moveTps(root);
            return;
        }
    };
    // Scope decision: the TPS readout updates are childList/characterData text
    // mutations inside the composer stack, so this task can only wake on the
    // tree key. A subtree-scoped observer would need one observer per
    // container, which the single full-tree observer design intentionally
    // avoids; the expensive composer-stack scan stays the cost of re-anchoring
    // markers that React rebuilds every token.
    return {
        name: 'stats-line',
        scopes: ['*'],
        ensure: mark,
        dispose: () => {
            // Hand the official layout back: return the TPS readout to its own
            // row, then drop the marker that drives the one-line strip.
            if (tpsOrigin !== null && tpsOrigin.parent.isConnected) {
                // Find the TPS readout only inside the marked stats strip we moved
                // it into — a global text search could pick up a different element.
                for (const stats of document.querySelectorAll('[data-mobile-nav="stats"]')) {
                    const tps = [...stats.querySelectorAll('div')].find((el) => el.children.length === 0 && /^TPS\s+\d/.test((el.textContent ?? '').trim()));
                    if (tps !== undefined) {
                        tpsOrigin.parent.insertBefore(tps, tpsOrigin.next);
                        break;
                    }
                }
            }
            for (const el of document.querySelectorAll('[data-mobile-nav="stats"]')) {
                el.removeAttribute('data-mobile-nav');
            }
            tpsOrigin = null;
        },
    };
}
};
__modules["effects/preview-fullscreen.js"] = function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPreviewFullscreenTask = createPreviewFullscreenTask;
const phone_chrome_ts_1 = require("./effects/phone-chrome.js");
function createPreviewFullscreenTask(t) {
    let button = null;
    const syncLabel = (target) => {
        const full = (0, phone_chrome_ts_1.getFrame)()?.hasAttribute('data-mobile-preview-full') ?? false;
        const label = t(full ? 'previewExitFullscreen' : 'previewFullscreen');
        if (target.getAttribute('aria-label') === label)
            return;
        target.setAttribute('aria-label', label);
        target.title = label;
    };
    const onClick = () => {
        (0, phone_chrome_ts_1.getFrame)()?.toggleAttribute('data-mobile-preview-full');
        if (button !== null)
            syncLabel(button);
    };
    return {
        name: 'preview-fullscreen-toggle',
        scopes: ['data-aionui-preview-open', 'data-mobile-preview-full'],
        ensure: () => {
            const col = document.querySelector('[data-aionui-preview-col]');
            if (col === null)
                return;
            if (button === null) {
                button = document.createElement('button');
                button.type = 'button';
                button.dataset.mobileNav = 'preview-full-toggle';
                button.innerHTML = [
                    '<svg class="dsh-maestro-mobile-full-in" viewBox="0 0 16 16" fill="none" aria-hidden="true">',
                    '<path d="M6 2H2v4M10 2h4v4M6 14H2v-4M10 14h4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
                    '</svg>',
                    '<svg class="dsh-maestro-mobile-full-out" viewBox="0 0 16 16" fill="none" aria-hidden="true">',
                    '<path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
                    '</svg>',
                ].join('');
                button.addEventListener('click', onClick);
            }
            syncLabel(button);
            if (button.parentElement !== col)
                col.appendChild(button);
        },
        dispose: () => {
            button?.remove();
            button = null;
        },
    };
}
};
__modules["effects/git-chip-reparent.js"] = function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createGitChipTask = createGitChipTask;
function createGitChipTask() {
    return {
        name: 'git-chip-reparent',
        scopes: ['*'],
        ensure: () => {
            const chip = document.querySelector('[data-slot="conversation.input.dock"] [data-gitgraph-chip-anchor]');
            if (chip === null)
                return;
            const card = document.querySelector('textarea')?.closest('[class*="_card"]');
            if (card == null)
                return;
            if (chip.parentElement !== card)
                card.insertBefore(chip, card.firstChild);
        },
        dispose: () => {
            const chip = document.querySelector('[data-slot="conversation.input.dock"] [data-gitgraph-chip-anchor]');
            const dock = document.querySelector('[data-slot="conversation.input.dock"]');
            if (chip !== null && dock !== null && chip.parentElement !== dock)
                dock.appendChild(chip);
        },
    };
}
};
__modules["effects/settings-toolbar-reparent.js"] = function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSettingsToolbarTask = createSettingsToolbarTask;
function createSettingsToolbarTask() {
    let origin = null;
    return {
        name: 'settings-toolbar-reparent',
        scopes: ['*'],
        ensure: () => {
            // On mobile (<1024) Settings is a bottom sheet with stacked nav (pill tabs)
            // + content column — the desktop reparent (header → nav) would break that
            // layout, so skip entirely on narrow viewports and restore if needed.
            if (window.matchMedia('(max-width: 1023px)').matches) {
                if (origin !== null) {
                    const h = document.querySelector('[aria-modal="true"] [class*="_header"]:not([class*="_headerActions"])');
                    if (h !== null && origin.parent.isConnected)
                        origin.parent.insertBefore(h, origin.next);
                    origin = null;
                }
                return;
            }
            const dialog = document.querySelector('[aria-modal="true"]');
            if (dialog === null)
                return;
            const nav = dialog.querySelector(':scope > [class*="_nav"]');
            const header = dialog.querySelector('[class*="_header"]:not([class*="_headerActions"])');
            if (nav === null || header === null)
                return;
            if (header.parentElement === nav)
                return;
            // The dialog DOM can be rebuilt by React between mutations: refresh
            // the origin every time we actually move the header, so disposal
            // restores it where it currently belongs, not where it was first seen.
            if (header.parentElement !== null) {
                origin = { parent: header.parentElement, next: header.nextSibling };
            }
            nav.appendChild(header);
        },
        dispose: () => {
            if (origin === null)
                return;
            const header = document.querySelector('[aria-modal="true"] [class*="_header"]:not([class*="_headerActions"])');
            if (header !== null && origin.parent.isConnected) {
                origin.parent.insertBefore(header, origin.next);
            }
            origin = null;
        },
    };
}
};
__modules["effects/overlay-backdrop-fab.js"] = function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fadeOverlayOut = fadeOverlayOut;
exports.createOverlayTask = createOverlayTask;
exports.createRightPanelBackdropTask = createRightPanelBackdropTask;
const phone_chrome_ts_1 = require("./effects/phone-chrome.js");
function fadeOverlayOut() {
    fadeHook?.();
}
let fadeHook = null;
const BACKDROP_FADE_MS = 200;
function createOverlayTask(t, toggleSidebar) {
    let backdrop = null;
    let fab = null;
    let backdropRemoveTimer = null;
    let faded = false;
    const drawerOpen = () => {
        const frame = (0, phone_chrome_ts_1.getFrame)();
        return frame !== null && !frame.hasAttribute('data-sidebar-collapsed');
    };
    const heroPhase = () => document.querySelector('[data-phase="active"]') === null;
    fadeHook = () => {
        if (backdrop === null)
            return;
        faded = true;
        backdrop.style.pointerEvents = 'none';
        backdrop.style.opacity = '0';
    };
    return {
        name: 'overlay-backdrop-fab',
        scopes: ['*', 'data-sidebar-collapsed', 'data-phase'],
        ensure: () => {
            const frame = (0, phone_chrome_ts_1.getFrame)();
            if (frame === null)
                return;
            if (drawerOpen()) {
                if (backdrop === null) {
                    backdrop = document.createElement('div');
                    backdrop.dataset.mobileNav = 'backdrop';
                    backdrop.setAttribute('role', 'button');
                    backdrop.setAttribute('aria-label', t('backdrop'));
                    backdrop.addEventListener('click', toggleSidebar);
                    frame.appendChild(backdrop);
                    faded = false;
                }
                else if (faded && backdropRemoveTimer !== null) {
                    window.clearTimeout(backdropRemoveTimer);
                    backdropRemoveTimer = null;
                    faded = false;
                    backdrop.style.removeProperty('pointer-events');
                    backdrop.style.removeProperty('opacity');
                }
            }
            else if (backdrop !== null) {
                backdrop.style.pointerEvents = 'none';
                backdrop.style.opacity = '0';
                faded = true;
                if (backdropRemoveTimer === null) {
                    backdropRemoveTimer = window.setTimeout(() => {
                        backdropRemoveTimer = null;
                        backdrop?.remove();
                        backdrop = null;
                    }, BACKDROP_FADE_MS + 60);
                }
            }
            if (heroPhase() && !drawerOpen() && fab === null) {
                fab = document.createElement('button');
                fab.type = 'button';
                fab.dataset.mobileNav = 'fab';
                fab.setAttribute('aria-label', t('open'));
                fab.title = t('open');
                fab.innerHTML =
                    '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true" width="18" height="18">' +
                        '<path fill-rule="evenodd" clip-rule="evenodd" d="M9.67272 0.522841C10.8339 0.522841 11.76 0.522714 12.4963 0.602493C13.2453 0.683657 13.8789 0.854248 14.4264 1.25197C14.7504 1.48739 15.0355 1.77247 15.2709 2.0965C15.6686 2.64394 15.8392 3.27758 15.9204 4.02655C16.0002 4.7629 16 5.68895 16 6.85014V9.14986C16 10.3111 16.0002 11.2371 15.9204 11.9735C15.8392 12.7224 15.6686 13.3561 15.2709 13.9035C15.0355 14.2275 14.7504 14.5126 14.4264 14.748C13.8789 15.1458 13.2453 15.3163 12.4963 15.3975C11.76 15.4773 10.8339 15.4772 9.67272 15.4772H6.3273C5.16611 15.4772 4.24006 15.4773 3.50371 15.3975C2.75474 15.3163 2.1211 15.1458 1.57366 14.748C1.24963 14.5126 0.964549 14.2275 0.729131 13.9035C0.331407 13.3561 0.160817 12.7224 0.0796529 11.9735C-0.000126137 11.2371 1.25338e-09 10.3111 1.25338e-09 9.14986V6.85014C1.25329e-09 5.68895 -0.000126137 4.7629 0.0796529 4.02655C0.160817 3.27758 0.331407 2.64394 0.729131 2.0965C0.964549 1.77247 1.24963 1.48739 1.57366 1.25197C2.1211 0.854248 2.75474 0.683657 3.50371 0.602493C4.24006 0.522714 5.16611 0.522841 6.3273 0.522841H9.67272ZM5.54303 1.88715V14.1118C5.78636 14.1128 6.04709 14.1169 6.3273 14.1169H9.67272C10.8639 14.1169 11.7032 14.1164 12.3493 14.0465C12.9824 13.9779 13.3497 13.8494 13.6268 13.6482C13.8354 13.4966 14.0195 13.3125 14.1711 13.1039C14.3723 12.8268 14.5007 12.4595 14.5693 11.8264C14.6393 11.1803 14.6398 10.341 14.6398 9.14986V6.85014C14.6398 5.65896 14.6393 4.81967 14.5693 4.1736C14.5007 3.54048 14.3723 3.17318 14.1711 2.89609C14.0195 2.68747 13.8354 2.50337 13.6268 2.35179C13.3497 2.1506 12.9824 2.02212 12.3493 1.95353C11.7032 1.88358 10.8639 1.88307 9.67272 1.88307H6.3273C6.04709 1.88307 5.78636 1.8862 5.54303 1.88715ZM4.1828 1.91166C3.99125 1.9216 3.8148 1.93577 3.65076 1.95353C3.01764 2.02212 2.65034 2.1506 2.37325 2.35179C2.16463 2.50337 1.98052 2.68747 1.82895 2.89609C1.62776 3.17318 1.49928 3.54048 1.43069 4.1736C1.36074 4.81967 1.36023 5.65896 1.36023 6.85014V9.14986C1.36023 10.341 1.36074 11.1803 1.43069 11.8264C1.49928 12.4595 1.62776 12.8268 1.82895 13.1039C1.98052 13.3125 2.16463 13.4966 2.37325 13.6482C2.65034 13.8494 3.01764 13.9779 3.65076 14.0465C4.29683 14.1164 5.13612 14.1169 6.3273 14.1169H9.67272C10.8639 14.1169 11.7032 14.1164 12.3493 14.0465C12.9824 13.9779 13.3497 13.8494 13.6268 13.6482C13.8354 13.4966 14.0195 13.3125 14.1711 13.1039C14.3723 12.8268 14.5007 12.4595 14.5693 11.8264C14.6393 11.1803 14.6398 10.341 14.6398 9.14986V6.85014C14.6398 5.65896 14.6393 4.81967 14.5693 4.1736C14.5007 3.54048 14.3723 3.17318 14.1711 2.89609C14.0195 2.68747 13.8354 2.50337 13.6268 2.35179C13.3497 2.1506 12.9824 2.02212 12.3493 1.95353C11.7032 1.88358 10.8639 1.88307 9.67272 1.88307H6.3273C5.13612 1.88307 4.29683 1.88358 3.65076 1.95353C3.47672 1.97129 3.30027 1.98546 3.10872 1.9954L4.1828 1.91166Z" fill="currentColor"/>' +
                        '</svg>';
                fab.addEventListener('click', toggleSidebar);
                frame.appendChild(fab);
            }
            else if ((!heroPhase() || drawerOpen()) && fab !== null) {
                fab.remove();
                fab = null;
            }
        },
        dispose: () => {
            if (backdropRemoveTimer !== null) {
                window.clearTimeout(backdropRemoveTimer);
                backdropRemoveTimer = null;
            }
            fadeHook = null;
            backdrop?.remove();
            backdrop = null;
            fab?.remove();
            fab = null;
        },
    };
}
function createRightPanelBackdropTask(t) {
    let backdrop = null;
    const isRightPanelOpen = () => {
        const panel = document.querySelector('[data-dsh-panel]');
        if (panel === null)
            return false;
        const hidden = panel.className.includes('panelHidden');
        return !hidden && !panel.hasAttribute('hidden') && getComputedStyle(panel).visibility !== 'hidden' && panel.getBoundingClientRect().width > 0;
    };
    const closeRightPanel = () => {
        const btn = document.querySelector('[data-dsh-toggle-cluster] button');
        if (btn !== null)
            btn.click();
        else {
            const panel = document.querySelector('[data-dsh-panel]');
            if (panel !== null) {
                const hiddenClass = [...panel.classList].find((c) => c.includes('panelHidden')) ?? 'nArs4W_panelHidden';
                panel.classList.add(hiddenClass);
            }
        }
    };
    return {
        name: 'right-panel-backdrop',
        scopes: ['*', 'class', 'style'],
        ensure: () => {
            const host = document.querySelector('[data-dsh-panel-host]');
            if (host === null)
                return;
            if (isRightPanelOpen() && backdrop === null) {
                backdrop = document.createElement('div');
                backdrop.dataset.mobileNav = 'right-backdrop';
                backdrop.setAttribute('role', 'button');
                backdrop.setAttribute('aria-label', t('backdrop'));
                backdrop.addEventListener('click', closeRightPanel);
                const panel = document.querySelector('[data-dsh-panel]');
                if (panel !== null && panel.parentElement === host)
                    host.insertBefore(backdrop, panel);
                else
                    host.appendChild(backdrop);
            }
            else if (!isRightPanelOpen() && backdrop !== null) {
                backdrop.remove();
                backdrop = null;
            }
        },
        dispose: () => {
            backdrop?.remove();
            backdrop = null;
        },
    };
}
};
__modules["effects/gesture-guard.js"] = function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markStrokeLocked = markStrokeLocked;
exports.clearStrokeLocked = clearStrokeLocked;
exports.isStrokeLocked = isStrokeLocked;
exports.markGestureConsumed = markGestureConsumed;
exports.consumeIfGestured = consumeIfGestured;
exports.isGestureConsumed = isGestureConsumed;
const consumed = new Map();
let strokeLocked = false;
function markStrokeLocked() {
    strokeLocked = true;
}
function clearStrokeLocked() {
    strokeLocked = false;
}
function isStrokeLocked() {
    return strokeLocked;
}
function isElementLike(value) {
    return (typeof value === 'object' &&
        value !== null &&
        'parentElement' in value &&
        value.parentElement !== undefined);
}
function markGestureConsumed(target, windowMs, upTo) {
    const until = performance.now() + windowMs;
    if (!isElementLike(target)) {
        consumed.set(target, until);
        return;
    }
    let el = target;
    while (el !== null) {
        consumed.set(el, until);
        if (el === upTo)
            break;
        el = isElementLike(el.parentElement) ? el.parentElement : null;
    }
}
function consumeIfGestured(event) {
    const now = performance.now();
    const target = event.target;
    if (!isElementLike(target)) {
        for (const [t, until] of consumed) {
            if (until <= now)
                consumed.delete(t);
        }
        return false;
    }
    let el = target;
    while (el !== null) {
        const until = consumed.get(el);
        if (until !== undefined) {
            if (until <= now) {
                consumed.delete(el);
            }
            else {
                return true;
            }
        }
        el = isElementLike(el.parentElement) ? el.parentElement : null;
    }
    return false;
}
function isGestureConsumed(target) {
    const until = consumed.get(target);
    if (until === undefined)
        return false;
    if (until <= performance.now()) {
        consumed.delete(target);
        return false;
    }
    return true;
}
};
__modules["effects/phone-chrome.js"] = function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DESKTOP_QUERY = exports.MOBILE_QUERY = void 0;
exports.installMobileEffect = installMobileEffect;
exports.findFrame = findFrame;
exports.getFrame = getFrame;
exports.installFrameController = installFrameController;
exports.installReconciler = installReconciler;
exports.addReconcilerTask = addReconcilerTask;
exports.installPhoneChrome = installPhoneChrome;
exports.installOverlayInteractions = installOverlayInteractions;
exports.registerReconcileTasks = registerReconcileTasks;
const reconciler_core_ts_1 = require("./core/reconciler-core.js");
const aionui_compat_ts_1 = require("./effects/aionui-compat.js");
const stats_line_ts_1 = require("./effects/stats-line.js");
const preview_fullscreen_ts_1 = require("./effects/preview-fullscreen.js");
const git_chip_reparent_ts_1 = require("./effects/git-chip-reparent.js");
const settings_toolbar_reparent_ts_1 = require("./effects/settings-toolbar-reparent.js");
const overlay_backdrop_fab_ts_1 = require("./effects/overlay-backdrop-fab.js");
const gesture_guard_ts_1 = require("./effects/gesture-guard.js");
// The custom client bundler cannot resolve `../` requires from src/client/effects,
// so this mirrors the namespace id from src/client/locales.ts. Keep in sync.
const NS = 'mobileNav';
/** Same breakpoint as the shell's SIDEBAR_AUTO_COLLAPSE (viewport < 1024). */
exports.MOBILE_QUERY = '(max-width: 1023px)';
/** Desktop no-op boundary, kept next to the mobile query for one source of truth. */
exports.DESKTOP_QUERY = '(min-width: 1024px)';
/**
 * Re-arm a mobile-only DOM effect on every width change. Replaces the
 * repeated matchMedia + change-listener scaffold so all breakpoint strings
 * live in one place.
 */
function installMobileEffect(ctx, label, install) {
    ctx.effect(() => {
        const narrow = window.matchMedia(exports.MOBILE_QUERY);
        let cleanup;
        const arm = () => {
            cleanup?.();
            cleanup = narrow.matches ? install(narrow) : undefined;
        };
        arm();
        narrow.addEventListener('change', arm);
        return () => {
            narrow.removeEventListener('change', arm);
            cleanup?.();
        };
    }, label);
}
/** The AppFrame element: direct parent of the shell overlay layer. */
function findFrame() {
    return document.querySelector('[data-shell-overlay]')?.parentElement ?? null;
}
/** Resolve the plugin-owned frame marker, falling back to the raw shell frame. */
function getFrame() {
    return document.querySelector('[data-mobile-nav="frame"]') ?? findFrame();
}
/**
 * Frame marker controller: owns `data-mobile-nav="frame"` and every plugin
 * marker that can survive on the shell-owned frame. Installed once at apply
 * time so effects no longer each need to find/set/clear the frame. Returns a
 * disposer that unregisters the task and resets the installed flag, so a
 * same-environment plugin reload can rebuild the reconciler from scratch.
 */
function installFrameController() {
    if (frameControllerInstalled)
        return () => { };
    frameControllerInstalled = true;
    let frame = null;
    const removeTask = addReconcilerTask({
        name: 'frame-marker',
        scopes: ['*'],
        ensure: () => {
            frame = findFrame();
            if (frame !== null && !frame.hasAttribute('data-mobile-nav')) {
                frame.setAttribute('data-mobile-nav', 'frame');
            }
        },
        dispose: () => {
            if (frame !== null) {
                frame.removeAttribute('data-mobile-nav');
                frame.removeAttribute('data-mobile-preview-full');
                frame.removeAttribute('data-aionui-explorer-open');
                frame.removeAttribute('data-aionui-preview-open');
            }
            frame = null;
        },
    });
    return () => {
        removeTask();
        frameControllerInstalled = false;
    };
}
let frameControllerInstalled = false;
let reconcileTasksRegistered = false;
let reconcilerInstalled = false;
// The DOM-free core owns the task registry, dirty-key routing, and coalesced
// flush scheduling; this module is the thin browser adapter that feeds it
// MutationObserver records and drives its lifecycle from the mobile effect.
const core = (0, reconciler_core_ts_1.createReconcilerCore)({
    requestFrame: (flush) => {
        let id = 0;
        const run = () => {
            id = 0;
            flush();
        };
        id = requestAnimationFrame(run);
        return () => {
            if (id !== 0)
                cancelAnimationFrame(id);
        };
    },
});
/**
 * One full-tree MutationObserver for every mobile DOM reconciler. Tasks can be
 * registered from React or plain effects; they only run while the mobile
 * breakpoint is active and are re-armed automatically on width changes.
 */
function installReconciler(ctx) {
    if (reconcilerInstalled)
        return () => { };
    reconcilerInstalled = true;
    installMobileEffect(ctx, 'dsh-maestro-mobile: DOM reconciler', () => {
        // Coalesce every mutation burst (typing, animations, per-token TPS
        // re-renders) into one dirty-key pass per animation frame. Each task
        // declares scopes so only intersecting tasks run on a given flush.
        const observer = new MutationObserver((records) => {
            const keys = new Set();
            for (const record of records) {
                keys.add(record.type === 'attributes' && record.attributeName !== null ? record.attributeName : '*');
            }
            core.note(keys);
        });
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [
                'style',
                'class',
                'data-phase',
                'data-sidebar-collapsed',
                'data-aionui-explorer-open',
                'data-aionui-preview-open',
                'data-mobile-preview-full',
            ],
        });
        core.activate();
        return () => {
            observer.disconnect();
            core.deactivate();
        };
    });
    return () => {
        reconcilerInstalled = false;
    };
}
/** Register a reconciler task. The returned disposer removes it immediately. */
function addReconcilerTask(task) {
    return core.register(task);
}
/**
 * Phone chrome: KEEP the system status bar (no fullscreen) and make it
 * blend into the page. On narrow screens:
 * - The viewport meta gains viewport-fit=cover, so env(safe-area-inset-top)
 *   is the real status-bar / notch height and the stylesheet can push every
 *   surface below it (off notched phones, or in a browser tab where the
 *   layout viewport already sits below the status bar, the inset is 0 and
 *   nothing shifts).
 * - A theme-color meta tracks the shell background (the official theme is
 *   toggled by body[data-ds-dark-theme], which flips --dsw-alias-bg-base):
 *   Android then paints the status bar / URL bar with the page's own base
 *   color, so the status bar reads as part of the UI instead of a foreign
 *   strip. The drawer paints the same strip on iOS / notch displays.
 * - gesturestart is suppressed as the legacy-iOS fallback for double-tap
 *   zoom; modern browsers are covered by the stylesheet's
 *   touch-action: manipulation (which keeps pan and pinch zoom).
 */
function installPhoneChrome(ctx) {
    installMobileEffect(ctx, 'dsh-maestro-mobile: status bar theme + viewport + zoom guard', () => {
        const viewport = document.querySelector('meta[name="viewport"]');
        const originalViewport = viewport?.content ?? '';
        const themeMeta = document.createElement('meta');
        themeMeta.name = 'theme-color';
        const bodyBg = () => getComputedStyle(document.body).backgroundColor;
        const sync = () => {
            if (viewport !== null) {
                // iOS Safari auto-zooms when focusing any field below 16px unless the
                // viewport meta carries maximum-scale=1. The host page may set that
                // flag; this rewrite REPLACES the meta, so carry the token forward
                // instead of dropping it (dispose restores the original anyway).
                const locked = /(^|,)\s*maximum-scale\s*=/.test(viewport.content);
                viewport.content = `width=device-width, initial-scale=1${locked ? ', maximum-scale=1' : ''}, viewport-fit=cover`;
            }
            themeMeta.content = bodyBg();
            if (themeMeta.parentElement === null)
                document.head.appendChild(themeMeta);
        };
        const restore = () => {
            if (viewport !== null)
                viewport.content = originalViewport;
            themeMeta.remove();
        };
        const onGestureStart = (event) => event.preventDefault();
        const observer = new MutationObserver(() => {
            themeMeta.content = bodyBg();
        });
        observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
        document.addEventListener('gesturestart', onGestureStart);
        sync();
        return () => {
            observer.disconnect();
            document.removeEventListener('gesturestart', onGestureStart);
            restore();
        };
    });
}
/**
 * Drawer close interactions that are plain event listeners, not DOM
 * reconciliation:
 * - Escape closes the drawer (yielding to any open modal dialog, which owns
 *   its own Escape handling). Fix for dsh-better-sidebar: Escape also closes
 *   the right workbench panel before the left drawer, so the panel does not
 *   remain covering chat when the user expects a dismiss.
 * - Tapping a navigation target inside the drawer (session row, task board /
 *   ssh takeover entries, search results) closes the drawer so the content
 *   it opened gets the whole screen. Session-row action buttons (kebab) are
 *   excluded — they open a menu that must survive the tap. Fix for
 *   dsh-better-sidebar: also close the right panel on navigation taps so
 *   chat is fully visible after navigation.
 */
function installOverlayInteractions(ctx) {
    installMobileEffect(ctx, 'dsh-maestro-mobile: drawer close (Escape + navigate)', () => {
        const toggleSidebar = () => ctx.layout.toggleSidebar();
        const drawerOpen = () => {
            const frame = getFrame();
            return frame !== null && !frame.hasAttribute('data-sidebar-collapsed');
        };
        // Fix for dsh-better-sidebar: detect right workbench panel open state on mobile
        const isRightPanelOpen = () => {
            const panel = document.querySelector('[data-dsh-panel]');
            if (panel === null)
                return false;
            return !panel.className.includes('panelHidden') && getComputedStyle(panel).visibility !== 'hidden' && panel.getBoundingClientRect().width > 0;
        };
        // Fix for dsh-better-sidebar: close the right panel via its toggle cluster
        const closeRightPanel = () => {
            const btn = document.querySelector('[data-dsh-toggle-cluster] button');
            if (btn !== null)
                btn.click();
        };
        const closeDrawerAndPanel = () => {
            toggleSidebar();
            if (isRightPanelOpen())
                closeRightPanel();
        };
        const onKeyDown = (event) => {
            if (event.key !== 'Escape')
                return;
            if (document.querySelector('[aria-modal="true"]') !== null)
                return;
            if (isRightPanelOpen()) {
                closeRightPanel();
                return;
            }
            if (drawerOpen())
                toggleSidebar();
        };
        // Capture phase: run before the shell or a plugin processes the click,
        // so takeover panels never render under the open drawer.
        const drawerRoot = () => document.querySelector('[data-mobile-nav="frame"] > :first-child');
        const shouldCloseOnTapInsideDrawer = (target) => {
            if (document.querySelector('[aria-modal="true"]') !== null)
                return false;
            if (!drawerOpen())
                return false;
            if (!(target instanceof Element))
                return false;
            const drawer = drawerRoot();
            if (drawer === null || !drawer.contains(target))
                return false;
            if (target.closest('[class*="sessionRow"] button') !== null)
                return false;
            return target.closest('button[data-dsh-taskboard-entry], button[data-dsh-ssh-entry], [class*="newSession"], [class*="sessionRow"], [class*="searchResultRow"], [class*="searchResultWorkspace"]') !== null;
        };
        // Touch path for session/search rows: never close the drawer from pointer
        // events. Closing at pointerup (or deferring the close) races the browser's
        // synthesized click; some iOS shells suppress that click entirely, so the
        // row's onClick never runs. Instead arm the drawer to close on the *fact*
        // of navigation: when the selected row's title changes, React has already
        // opened the conversation, so the drawer can close safely.
        // Ported from mexiaosqwq/dsh-web-mobile v2.2.0 (#32) while keeping
        // dsh-better-sidebar right-panel handling.
        let lastTouchNavAt = 0;
        let navSignatureAtArm = '';
        let navObserver = null;
        let navTimer = null;
        const selectedRowSignature = () => {
            const selected = drawerRoot()?.querySelector('[role="treeitem"][aria-selected="true"]');
            const title = selected?.querySelector('[class*="_title"]');
            return title?.textContent?.trim() ?? null;
        };
        const disarmNav = () => {
            navObserver?.disconnect();
            navObserver = null;
            if (navTimer !== null)
                window.clearTimeout(navTimer);
            navTimer = null;
            navSignatureAtArm = '';
        };
        const armNav = () => {
            disarmNav();
            navSignatureAtArm = selectedRowSignature() ?? '';
            const root = drawerRoot();
            if (root === null)
                return;
            navObserver = new MutationObserver(() => {
                if (!drawerOpen()) {
                    disarmNav();
                    return;
                }
                const signature = selectedRowSignature();
                if (signature !== null && signature !== navSignatureAtArm) {
                    disarmNav();
                    closeDrawerAndPanel();
                }
            });
            navObserver.observe(root, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['aria-selected'],
            });
            navTimer = window.setTimeout(disarmNav, 2000);
        };
        const onDrawerClick = (event) => {
            if ((0, gesture_guard_ts_1.isStrokeLocked)() || (0, gesture_guard_ts_1.consumeIfGestured)(event))
                return;
            // A touch row-tap owns the close (pointerup or the navigation observer);
            // let the row's click reach React without toggling the drawer twice.
            if (performance.now() - lastTouchNavAt < 500)
                return;
            if (shouldCloseOnTapInsideDrawer(event.target))
                closeDrawerAndPanel();
        };
        const onDrawerPointerUp = (event) => {
            if ((0, gesture_guard_ts_1.isStrokeLocked)() || (0, gesture_guard_ts_1.consumeIfGestured)(event))
                return;
            if (event.pointerType !== 'touch' && event.pointerType !== 'pen')
                return;
            const target = event.target;
            if (!(target instanceof Element))
                return;
            if (!shouldCloseOnTapInsideDrawer(target))
                return;
            const row = target.closest('[role="treeitem"]');
            if (row !== null) {
                lastTouchNavAt = performance.now();
                if (row.getAttribute('aria-selected') === 'true') {
                    // Already-selected row will not navigate; closing immediately is safe.
                    closeDrawerAndPanel();
                }
                else {
                    // Unselected row: let navigation land, then close via the observer.
                    armNav();
                }
                return;
            }
            // Non-row nav targets (newSession / taskboard / ssh / search rows that
            // are not treeitems): the pointerup close path is still correct.
            closeDrawerAndPanel();
        };
        document.addEventListener('keydown', onKeyDown, true);
        document.addEventListener('click', onDrawerClick, true);
        document.addEventListener('pointerup', onDrawerPointerUp, true);
        return () => {
            disarmNav();
            document.removeEventListener('keydown', onKeyDown, true);
            document.removeEventListener('click', onDrawerClick, true);
            document.removeEventListener('pointerup', onDrawerPointerUp, true);
        };
    });
}
/**
 * Register the shared DOM reconciler tasks. Returns a disposer that
 * unregisters every task and resets the flag, so a same-environment plugin
 * reload can rebuild the reconciler from scratch.
 */
function registerReconcileTasks(ctx) {
    if (reconcileTasksRegistered)
        return () => { };
    reconcileTasksRegistered = true;
    const t = ctx.locale.bind(NS);
    const removeTasks = [
        addReconcilerTask((0, preview_fullscreen_ts_1.createPreviewFullscreenTask)(t)),
        addReconcilerTask((0, git_chip_reparent_ts_1.createGitChipTask)()),
        addReconcilerTask((0, settings_toolbar_reparent_ts_1.createSettingsToolbarTask)()),
        addReconcilerTask((0, aionui_compat_ts_1.createPreviewCloseTask)()),
        addReconcilerTask((0, aionui_compat_ts_1.createSheetRiseTask)()),
        addReconcilerTask((0, stats_line_ts_1.createStatsLineTask)()),
        // Legacy overlay task migrated to shell.overlay slot (ShellOverlay.tsx) — DSH-native
        // Keep right-panel backdrop as reconciler task (panel-host is outside shell.overlay)
        addReconcilerTask((0, overlay_backdrop_fab_ts_1.createRightPanelBackdropTask)(t)),
    ];
    return () => {
        for (const remove of removeTasks)
            remove();
        reconcileTasksRegistered = false;
    };
}
};
__modules["components/MobileNavToggle.js"] = function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MobileNavToggle = MobileNavToggle;
const jsx_runtime_1 = require("react/jsx-runtime");
const dsh_client_ui_primitives_1 = require("@deepseek-ai/dsh-client-ui-primitives");
const phone_chrome_ts_1 = require("./effects/phone-chrome.js");
/**
 * Mobile-only icon buttons next to the session title:
 * - toggle: opens the directory drawer on narrow screens.
 * - files: toggles the dsh-web-ui explorer sheet directly — one tap opens,
 *   a second tap closes it, no drawer round-trip. (The drawer footer keeps
 *   a Files entry for the hero/blank phases where this header does not
 *   exist.)
 * Hidden entirely on wide screens (CSS media query).
 */
function MobileNavToggle({ toggleSidebar, t }) {
    const toggleExplorer = () => {
        const frame = (0, phone_chrome_ts_1.getFrame)();
        if (frame === null)
            return;
        if (frame.hasAttribute('data-aionui-explorer-open')) {
            frame.removeAttribute('data-aionui-explorer-open');
        }
        else {
            // The preview sheet outranks the explorer in compat.css (two stacked
            // sheets read as one broken overlay): opening the explorer must yield
            // the preview, or the Files action appears dead while preview is up.
            frame.removeAttribute('data-aionui-preview-open');
            frame.setAttribute('data-aionui-explorer-open', '');
        }
    };
    return ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("button", { type: "button", "data-mobile-nav": "toggle", "aria-label": t('open'), title: t('open'), onClick: () => toggleSidebar(), children: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconPanelLeftOutline16, { size: 16 }) }), (0, jsx_runtime_1.jsx)("button", { type: "button", "data-mobile-nav": "files", "aria-label": t('files'), title: t('files'), onClick: toggleExplorer, children: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconFolderOpenOutline16, { size: 16 }) })] }));
}
};
__modules["components/MobileDrawerFooter.js"] = function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MobileDrawerFooter = MobileDrawerFooter;
const jsx_runtime_1 = require("react/jsx-runtime");
const dsh_client_ui_primitives_1 = require("@deepseek-ai/dsh-client-ui-primitives");
const phone_chrome_ts_1 = require("./effects/phone-chrome.js");
/**
 * Mobile-only drawer footer actions, relocated from the session header to the
 * drawer footer (beside Settings):
 * - Files: opens the dsh-web-ui aionui explorer as a floating bottom sheet
 *   (the explorer column is hidden on mobile until this marker is set, so
 *   the suite's own persisted-expanded state can never cover the UI on load).
 * - Session log: the official session-log-export controller, so the
 *   progress/result dialog is shared with the desktop flow.
 * Hidden entirely on wide screens (CSS media query).
 */
function MobileDrawerFooter({ useSessions, downloadSessionLog, toggleSidebar, t }) {
    const sessionId = useSessions((state) => state.current);
    const openExplorer = () => {
        (0, phone_chrome_ts_1.getFrame)()?.removeAttribute('data-aionui-preview-open');
        (0, phone_chrome_ts_1.getFrame)()?.setAttribute('data-aionui-explorer-open', '');
        toggleSidebar();
    };
    return ((0, jsx_runtime_1.jsxs)("div", { "data-mobile-nav": "drawer-actions", children: [(0, jsx_runtime_1.jsxs)("button", { type: "button", "data-mobile-nav": "explorer", "aria-label": t('files'), title: t('files'), onClick: openExplorer, style: { display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 10px', borderRadius: 999, border: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', font: 'var(--dsw-font-xs-13)', cursor: 'pointer' }, children: [(0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconPanelLeftOutline16, { size: 14 }), (0, jsx_runtime_1.jsx)("span", { children: t('files') })] }), (0, jsx_runtime_1.jsxs)("button", { type: "button", "data-mobile-nav": "session-log", "aria-label": t('sessionLog'), title: t('sessionLog'), disabled: sessionId === undefined, onClick: () => {
                    if (sessionId !== undefined)
                        downloadSessionLog(sessionId);
                }, style: { display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 10px', borderRadius: 999, border: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', font: 'var(--dsw-font-xs-13)', cursor: 'pointer', opacity: sessionId === undefined ? 0.5 : 1 }, children: [(0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconDownloadOutline16, { size: 14 }), (0, jsx_runtime_1.jsx)("span", { children: t('sessionLog') })] })] }));
}
};
__modules["components/ShellOverlay.js"] = function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShellOverlay = ShellOverlay;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const phone_chrome_ts_1 = require("./effects/phone-chrome.js");
/**
 * DSH-native shell overlay: backdrop + FAB rendered inside AppFrame's
 * overlayLayer (z20, pointer-events auto per child). Reuses DSH's
 * overlay container instead of manual frame.appendChild.
 * Drawer open state reads the same data-sidebar-collapsed that AppFrame owns.
 * @param props - overlay props.
 */
function ShellOverlay({ toggleSidebar, t }) {
    const [drawerOpen, setDrawerOpen] = (0, react_1.useState)(false);
    const [heroPhase, setHeroPhase] = (0, react_1.useState)(false);
    const [narrow, setNarrow] = (0, react_1.useState)(() => window.matchMedia(phone_chrome_ts_1.MOBILE_QUERY).matches);
    (0, react_1.useEffect)(() => {
        const mq = window.matchMedia(phone_chrome_ts_1.MOBILE_QUERY);
        const onMq = () => setNarrow(mq.matches);
        mq.addEventListener('change', onMq);
        const read = () => {
            const frame = (0, phone_chrome_ts_1.getFrame)();
            setDrawerOpen(frame !== null && !frame.hasAttribute('data-sidebar-collapsed'));
            setHeroPhase(document.querySelector('[data-phase="active"]') === null);
        };
        read();
        const mo = new MutationObserver(read);
        mo.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['data-sidebar-collapsed', 'data-phase'],
        });
        return () => {
            mq.removeEventListener('change', onMq);
            mo.disconnect();
        };
    }, []);
    if (!narrow)
        return null;
    return ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [drawerOpen && ((0, jsx_runtime_1.jsx)("div", { "data-mobile-nav": "backdrop", "data-shell-overlay-backdrop": "true", role: "button", "aria-label": t('backdrop'), onClick: () => toggleSidebar(), style: { pointerEvents: 'auto' } })), heroPhase && !drawerOpen && ((0, jsx_runtime_1.jsx)("button", { type: "button", "data-mobile-nav": "fab", "data-shell-overlay-fab": "true", "aria-label": t('open'), title: t('open'), onClick: () => toggleSidebar(), style: { position: 'absolute', pointerEvents: 'auto' }, children: (0, jsx_runtime_1.jsxs)("svg", { viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true", width: "18", height: "18", children: [(0, jsx_runtime_1.jsx)("path", { fillRule: "evenodd", clipRule: "evenodd", d: "M9.67 0.52C10.83 0.52 11.76 0.52 12.5 0.60C13.25 0.68 13.88 0.85 14.43 1.25C14.75 1.49 15.04 1.77 15.27 2.10C15.67 2.64 15.84 3.28 15.92 4.03C16 4.76 16 5.69 16 6.85V9.15C16 10.31 16 11.24 15.92 11.97C15.84 12.72 15.67 13.36 15.27 13.90C15.04 14.23 14.75 14.51 14.43 14.75C13.88 15.15 13.25 15.32 12.5 15.40C11.76 15.48 10.83 15.48 9.67 15.48H6.33C5.17 15.48 4.24 15.48 3.50 15.40C2.75 15.32 2.12 15.15 1.57 14.75C1.25 14.51 0.96 14.23 0.73 13.90C0.33 13.36 0.16 12.72 0.08 11.97C-0 11.24 0 10.31 0 9.15V6.85C0 5.69 -0 4.76 0.08 4.03C0.16 3.28 0.33 2.64 0.73 2.10C0.96 1.77 1.25 1.49 1.57 1.25C2.12 0.85 2.75 0.68 3.50 0.60C4.24 0.52 5.17 0.52 6.33 0.52H9.67Z", fill: "currentColor", opacity: "0.12" }), (0, jsx_runtime_1.jsx)("path", { d: "M5 8H11M8 5V11", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round" })] }) }))] }));
}
};
__modules["styles/base.css.js"] = function (require, module, exports) {
"use strict";
// base — split from src/client/mobile.css.ts (2026-08-16), order preserved.
// Do not reorder: styles/index.ts concatenates in this exact order.
Object.defineProperty(exports, "__esModule", { value: true });
exports.BASE_CSS = void 0;
exports.BASE_CSS = `
/* ---------- base control styles (rendered at any width, hidden where unused) ---------- */

[data-mobile-nav="toggle"],
[data-mobile-nav="files"] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: none;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--dsw-alias-label-secondary, inherit);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
[data-mobile-nav="toggle"]:hover,
[data-mobile-nav="files"]:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .06));
}
[data-mobile-nav="toggle"]:focus-visible,
[data-mobile-nav="files"]:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #4f6ef7);
  outline-offset: 1px;
}

/* Drawer footer actions — Bento Foot Card (B): two equal pills on the
   top row of the footArea card, Settings as full-width ghost below. The card
   itself is styled in layout.css (footArea). */
[data-mobile-nav="drawer-actions"] {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
}
[data-mobile-nav="session-log"],
[data-mobile-nav="explorer"] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex: 1 1 0;
  min-width: 0;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .12));
  border-radius: 12px;
  background: var(--dsw-alias-bg-base, #ffffff);
  color: var(--dsw-alias-label-primary, inherit);
  font-family: inherit;
  font-size: 13px;
  line-height: 20px;
  font-weight: 500;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
[data-mobile-nav="session-log"]:hover:not(:disabled),
[data-mobile-nav="explorer"]:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .06));
}
[data-mobile-nav="session-log"]:focus-visible,
[data-mobile-nav="explorer"]:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #4f6ef7);
  outline-offset: 1px;
}
[data-mobile-nav="session-log"]:disabled {
  color: var(--dsw-alias-label-dimmed, rgba(0, 0, 0, .35));
  border-color: var(--dsw-alias-border-l1, rgba(0, 0, 0, .08));
  cursor: default;
}

/* Floating fallback button (hero / blank phases without a session header).
   The top clears the camera band below the status bar; when the client has
   set viewport-fit=cover the safe-area inset moves it below the notch too. */
[data-mobile-nav="fab"] {
  position: absolute;
  top: calc(env(safe-area-inset-top, 0px) + 72px);
  left: 10px;
  z-index: 21;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  padding: 0;
  border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .12));
  border-radius: 50%;
  background: var(--dsw-alias-button-floating-fill, #ffffff);
  color: var(--dsw-alias-label-primary, inherit);
  cursor: pointer;
  box-shadow: 0 2px 12px rgba(0, 0, 0, .18);
  -webkit-tap-highlight-color: transparent;
}
[data-mobile-nav="fab"]:hover {
  background: var(--dsw-alias-button-floating-hover, rgba(0, 0, 0, .08));
}
[data-mobile-nav="fab"]:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #4f6ef7);
  outline-offset: 2px;
}

/* Dimmed backdrop under the open drawer; above every column, below the drawer. */
[data-mobile-nav="backdrop"] {
  position: absolute;
  inset: 0;
  z-index: 30;
  background: rgba(0, 0, 0, .45);
  cursor: pointer;
  animation: dsh-maestro-mobile-fade .2s var(--ds-ease-in-out, ease-in-out);
  -webkit-tap-highlight-color: transparent;
}
/* Fix for dsh-better-sidebar (npm: dsh-better-sidebar) — right-panel backdrop on mobile:
   sits inside [data-dsh-panel-host] at z-index 39 — just below the panel (40)
   and toggle cluster (45), but above the center column (host itself is at 25).
   Gives the drawer a tappable dimmed layer so chat is not silently hidden
   behind it. Host has pointer-events:none, so this must re-enable hit-testing. */
[data-mobile-nav="right-backdrop"] {
  position: absolute;
  inset: 0;
  z-index: 39;
  background: rgba(0, 0, 0, .45);
  cursor: pointer;
  pointer-events: auto !important;
  animation: dsh-maestro-mobile-fade .2s var(--ds-ease-in-out, ease-in-out);
  -webkit-tap-highlight-color: transparent;
}
@keyframes dsh-maestro-mobile-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
/* Settings sheet entrance: the official dialog mounts with no animation at
   all, so it snaps in. Fade + slight rise/scale reads as a proper sheet. */
@keyframes dsh-maestro-mobile-sheet-in {
  from {
    opacity: 0;
    transform: translateY(14px) scale(.98);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
/* Preview sheet rise: the aionui preview column opens as a bottom sheet. */
@keyframes dsh-maestro-mobile-sheet-up {
  from {
    opacity: 0;
    transform: translateY(28px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

`;
};
__modules["styles/layout.css.js"] = function (require, module, exports) {
"use strict";
// layout — split from src/client/mobile.css.ts (2026-08-16), order preserved.
// Self-contained: the mobile media query opens and closes in this file.
Object.defineProperty(exports, "__esModule", { value: true });
exports.LAYOUT_CSS = void 0;
exports.LAYOUT_CSS = `/* ---------- mobile-only layout ---------- */

@media (max-width: 1023px) {
  /* --- Phone chrome ---
     The system status bar stays visible (no fullscreen). Three adjustments
     make it behave:
     - touch-action: pan-y keeps vertical pan while forbidding horizontal pan
       on the root — without it a left-edge horizontal drag is claimed as a
       pan (pointercancel) before the swipe layer can classify it. Also kills
       double-tap-to-zoom delay; pinch-zoom stays via manipulation alias but
       the app-like pan-y is the gesture-layer contract.
     - overscroll-behavior-x: none suppresses Chrome's edge history navigation
       (48dp strip) that would navigate back on the same edge swipe that opens
       the drawer.
     - With the client's viewport-fit=cover, env(safe-area-inset-top) is the
       status bar / notch height; the rules below push the app content below
       it so the status bar never covers anything. Off notched phones (or in
       a normal browser tab where the layout viewport already sits below the
       status bar) the inset is 0 and nothing shifts. */
  html,
  body {
    touch-action: pan-y !important;
    overscroll-behavior-x: none !important;
  }

  /* AppFrame: the drawer takes the sidebar column out of grid flow, so the
     remaining in-flow items (center, details) land in tracks 1..2: give the
     center every pixel and keep the details track at zero. The top padding
     clears the status bar / notch for every in-flow surface (session header,
     messages, composer); the absolutely-positioned drawer is unaffected (its
     containing block is the frame's padding box, i.e. still the frame top).
     box-sizing MUST be border-box: the official frame is height:100% of a
     100%-height body, and it is content-box by default, so the safe-area
     padding is ADDED on top of the full viewport height. The frame then grows
     to 100% + inset, the document itself becomes scrollable by exactly the
     inset, and the sticky composer seat (bottom:0 of the scroll body) lands
     below the visual viewport. Symptoms on a notched phone: the whole UI can
     be swiped up, the composer lifts off the bottom leaving a blank strip,
     and the newest message sits under the composer because the host's
     at-bottom follow scrolls its own scroll body, not the document. With
     border-box the padding is taken out of the 100% height instead, so the
     frame is exactly one viewport tall and the document never scrolls. */
  [data-mobile-nav="frame"] {
    box-sizing: border-box !important;
    position: relative !important;
    grid-template-columns: minmax(0, 1fr) 0 0 !important;
    padding-top: env(safe-area-inset-top, 0px) !important;
  }

  /* The sidebar column (first grid child) becomes a left drawer. The drawer
     hugs the sidebar content exactly (the wide sidebar carries an inline
     width, ~280px): a fixed 92vw box would leave a white strip where the
     container background shows beside the content.
     Closed state: translateX(-110%) — more than -100% of the max-content
     width — guarantees the whole drawer (and its shadow, had it one) leaves
     the viewport. A mere -100% leaves a sliver on screen; -105% (as used
     before) left 14px of the drawer plus a long 32px-blur shadow gradient
     visible along the left edge of the main UI. No box-shadow at all: the
     dimmed backdrop already separates drawer from content. */
  [data-mobile-nav="frame"] > :first-child {
    position: absolute !important;
    inset: 0 auto 0 0 !important;
    width: max-content;
    max-width: 92vw;
    z-index: 150 !important; /* above shell.overlay (z100) so backdrop (z30 inside) stays below drawer and session rows remain tappable */
    transform: translateX(-110%);
    transition: transform .28s var(--ds-ease-in-out, ease-in-out);
    background: var(--dsw-alias-bg-base, #ffffff);
    /* Keep the drawer's own content below the status bar / notch: the drawer
       spans the full frame height (its absolute containing block is the
       frame's padding box, so the frame's own safe-area padding does NOT
       reach it). The drawer background paints the status-bar strip, which
       the client's theme-color meta matches, so the strip reads seamless. */
    padding-top: env(safe-area-inset-top, 0px) !important;
    padding-bottom: env(safe-area-inset-bottom, 0px) !important;
    box-sizing: border-box !important;
    /* Kill the official sidebarCol right border: with the backdrop the edge
       reads cleanly, and the settings dialog (width:100% of this box) stays
       pixel-flush with the drawer. */
    border-right: none !important;
  }

  /* Expanded state (frame without data-sidebar-collapsed) slides the drawer in.
     The open state must be transform:none — NOT translateX(0): an identity
     transform still makes the drawer the containing block for fixed-position
     descendants (the settings dialog's .VOzbGW_overlay is portaled into the
     sidebar DOM). With the identity transform the wide settings sheet
     (100vw-16) overflows the 280px drawer, the dialog's focus scrolls the
     overflow:hidden drawer to scrollLeft=102, and every static child (plus the
     fixed overlay) shifts 102px off-screen. With transform:none the overlay is
     viewport-anchored: it dims the full screen and the sheet sits at left:8. */
  [data-mobile-nav="frame"]:not([data-sidebar-collapsed]) > :first-child {
    transform: none !important;
  }

  /* Drawer swipe gestures: touch-action pan-y lets horizontal pointermove reach the
     gesture layer without browser pan/pointercancel; start-hit is geometry-only
     (45% viewport) with no hotspot element. */
  [data-mobile-nav="frame"] > :first-child {
    touch-action: pan-y !important;
  }

  @media (prefers-reduced-motion: reduce) {
    [data-mobile-nav="frame"] > :first-child {
      transition: none !important;
    }
  }

  /* Settings is the final drawer action. Give it the same phone gutters as
     the rest of the drawer and make its label a centered, full-width target.
     The trigger (ui-settings-general .trigger) is a full-width flex row with
     upstream left-aligned chrome: asymmetric padding (0 10px 0 8px) and a
     negative -2px inline margin. When the mobile rule centers that row, the
     leftover asymmetry pushes the centered icon+label group off the true
     center (it sits ~2px left of the drawer's centerline and the "Settings"
     text lands 11px right of it), and the negative margin overruns the 12px
     gutter by 2px each side. Normalize both so the row is flush to the gutter
     and the group reads as centered.
     The settings area sits inside the drawer's foot area (already inset
     12px each side), so it must NOT add its own padding-inline: the trigger
     width:100% of a padded box made the area 12px wider than the drawer
     (0-324 vs 312), pushing the Settings button to 24-312 — shifted right
     of the Files / Session log row (12-300). Drop the area's own inline
     padding and make it fill so the trigger lands at 12-300. */
  [data-mobile-nav="frame"] [class*="_settingsArea"] {
    padding-inline: 0 !important;
    width: 100% !important;
    box-sizing: border-box !important;
  }
  /* Settings primary inside Bento card — one notch bolder: elevated fill,
     l2 border + subtle shadow + 600 weight + 16px icon so it reads primary
     against the 36px secondary pills (13/500).
     The trigger is the ONLY settings-area button without data-phase: the
     ConnectionIndicator chip (Connecting…/Disconnected) is a
     button[data-phase], while the recovered Connected confirmation is a
     div[role="status"] with NO data-phase (official ConnectionIndicator
     output) — both must keep their own compact warning/success palette,
     NOT this stretch. Without the :not([data-phase]) guard the width:100%
     force hit the chip too (flex:none, so it could not shrink): the
     triggerRow overflowed (scrollW 402 vs clientW 238) and the Settings
     trigger crushed to 30px. */
  [data-mobile-nav="frame"] [class*="_settingsArea"] button:not([data-phase]):not([aria-modal="true"] *) {
    width: 100% !important;
    justify-content: flex-start !important;
    align-items: center !important;
    margin-inline: 0 !important;
    padding-inline: 14px !important;
    text-align: left !important;
    height: 42px !important;
    min-height: 42px !important;
    border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.14)) !important;
    background: var(--dsw-alias-button-elevated-fill, #ffffff) !important;
    border-radius: 12px !important;
    box-sizing: border-box !important;
    gap: 8px !important;
    font-size: 14px !important;
    line-height: 20px !important;
    font-weight: 600 !important;
    box-shadow: 0 1px 6px rgba(0,0,0,.06) !important;
  }
  [data-mobile-nav="frame"] [class*="_settingsArea"] button:not([data-phase]):not([aria-modal="true"] *):hover {
    background: var(--dsw-alias-button-floating-hover, rgba(0,0,0,.06)) !important;
  }
  [data-mobile-nav="frame"] [class*="_settingsArea"] button:not([data-phase]):not([aria-modal="true"] *) svg {
    width: 16px !important;
    height: 16px !important;
  }
  /* ConnectionIndicator beside Settings — the trigger row officially lays
     trigger + chip inline (flex row, gap 8), which cannot fit the ~300px
     drawer. When the chip renders, lift it to the TOP of the Bento foot
     card (Connecting…/Disconnected/Connected first, Files/Session log pills
     second, Settings last) instead of squeezing it beside/under the trigger:
     dissolve the settingsArea/triggerRow wrappers with display:contents so
     chip, pills and trigger become sibling flex items of the foot column,
     then order chip first (-1), trigger last (1). The chip keeps its own
     warn/success palette (its width:100% styling must NOT leak into the
     primary trigger — see the [data-phase] guard on the trigger rules).
     The chip matcher covers BOTH official shapes: button[data-phase] for
     Connecting/Disconnected and div[role="status"] for the recovered
     Connected confirmation, which carries no data-phase. */
  [data-mobile-nav="frame"] [class*="_footArea"]:has([class*="_triggerRow"] > :is(button[data-phase], div[role="status"])) {
    gap: 8px !important;
  }
  [data-mobile-nav="frame"] [class*="_footArea"]:has([class*="_triggerRow"] > :is(button[data-phase], div[role="status"])) [class*="_settingsArea"],
  [data-mobile-nav="frame"] [class*="_footArea"]:has([class*="_triggerRow"] > :is(button[data-phase], div[role="status"])) [class*="_triggerRow"] {
    display: contents !important;
  }
  [data-mobile-nav="frame"] [class*="_footArea"]:has([class*="_triggerRow"] > :is(button[data-phase], div[role="status"])) [class*="_settingsArea"] :is(button[data-phase], div[role="status"]) {
    order: -1 !important;
    flex: 0 0 auto !important;
    width: 100% !important;
    height: 36px !important;
    min-height: 36px !important;
    justify-content: flex-start !important;
    align-items: center !important;
    padding-inline: 14px !important;
    margin-inline: 0 !important;
    border-radius: 10px !important;
    box-sizing: border-box !important;
    gap: 6px !important;
    font-size: 13px !important;
    line-height: 20px !important;
    font-weight: 500 !important;
    text-align: left !important;
  }
  [data-mobile-nav="frame"] [class*="_footArea"]:has([class*="_triggerRow"] > :is(button[data-phase], div[role="status"])) [class*="_settingsArea"] button:not([data-phase]) {
    order: 1 !important;
    flex: 0 0 auto !important;
  }
  /* Maestro in footer.action must match Settings trigger on mobile — same 42h left-align */
  [data-mobile-nav="frame"] [data-maestro-trigger] {
    width: 100% !important;
    justify-content: flex-start !important;
    margin-inline: 0 !important;
    padding-inline: 12px !important;
    text-align: left !important;
    height: 42px !important;
    border-radius: 12px !important;
    gap: 8px !important;
  }

  /* Bento Foot Card (B): footArea becomes a card grouping Files|Session log pills + Settings.
     The card sits inside the already-inset drawer (12px gutters), so no extra outer margin.
     Tokens: bg-layer-2, border-l1, r14, label/interactive tokens. */
  [data-mobile-nav="frame"] [class*="_footArea"] {
    background: var(--dsw-alias-bg-layer-2, #f5f5f5) !important;
    border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.08)) !important;
    border-radius: 14px !important;
    padding: 10px !important;
    box-sizing: border-box !important;
    flex-direction: column !important;
  }
  [data-mobile-nav="frame"] [class*="_footArea"] [class*="_footerActions"] {
    display: flex !important;
    flex-direction: column !important;
    gap: 8px !important;
    width: 100% !important;
  }

  /* Drag handles are useless on touch and would float over the drawer. */
  [data-side="sidebar"],
  [data-side="details"] {
    display: none !important;
  }

  /* --- Conversation text on mobile ---
     The official message flow keeps desktop's 32px side gutters and 16px
     type. On a phone: shrink the type a notch and widen the lines by
     trimming the gutters (the sidebar drawer list keeps its size). The
     flow's scroll container is the only _scroll element holding markdown
     <p> paragraphs — the composer's own scroll (textarea) is excluded
     via :has(p). */
  /* The official main scroll body reserves scrollbar-gutter for desktop
     scrollbars (8px), which shoves every column off-center on a phone.
     Classic desktop scrollbars (Edge/Chrome) also occupy ~8-17px in a
     phone-sized viewport, shifting the column further. Mobile scrolling
     is touch/wheel, so remove the scrollbar entirely on phones: the
     column is then exactly centered in every browser. */
  [data-phase] [class*="_scrollBody"] {
    scrollbar-gutter: auto !important;
    scrollbar-width: none;
  }
  [data-phase] [class*="_scrollBody"]::-webkit-scrollbar {
    display: none !important;
    width: 0;
    height: 0;
  }
  /* Message action rows (copy / run-time badges) can overflow the right
     edge on narrow screens — keep them inside the message width. */
  [data-phase] [class*="_actions"] {
    overflow: hidden;
  }
  [data-phase] [class*="_actions"] [class*="_timeEnd"] {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap !important;
  }

  [data-phase] [class*="_scroll"]:not([class*="_scrollBody"]):has(p) {
    padding-left: 20px;
    padding-right: 20px;
    font-size: 15px !important;
  }
  /* The official markdown styles set an explicit 16px on paragraphs and
     list items, so the container's inherited 15px is not enough. User
     messages render their text in a div whose class carries _text_
     (16px too) — cover it as well. */
  [data-phase] [class*="_scroll"]:not([class*="_scrollBody"]):has(p) p,
  [data-phase] [class*="_scroll"]:not([class*="_scrollBody"]):has(p) li,
  [data-phase] [class*="_scroll"]:not([class*="_scrollBody"]):has(p) [class*="_text_"] {
    font-size: 15px !important;
  }

  /* Markdown tables: the official table uses width:max-content, so on a phone
     it hugs the content and leaves dead space beside/inside the table. Force
     the table to fill the message column and let the table wrapper handle
     overflow if a cell is genuinely too wide. */
  [data-phase] table {
    width: 100%;
    max-width: 100%;
  }
  [data-phase] th,
  [data-phase] td {
    max-width: none;
    min-width: 0;
  }

  /* Markdown images: the official rule often forces width:100%, which
     upscales small square images to the full message column. Show small
     images at their intrinsic size; large / very wide images still scale
     down to fit the column (max-width:100% keeps horizontal panoramas
     adaptive without overflowing). */
  [data-phase] [class*="_scroll"]:not([class*="_scrollBody"]) img {
    width: auto !important;
    max-width: 100% !important;
    height: auto !important;
    /* Cap square / tall images so a big sticker does not dominate the
       narrow column; landscape images stay governed by max-width only.
       The plain px line is the fallback for engines without dvh. */
    max-height: 220px !important;
    max-height: min(40dvh, 220px) !important;
  }

  /* User bubbles: the official stack is capped at min(525px, 82%), which on a
     phone leaves a large blank strip on the left and pushes the bubble high.
     On mobile let the user message fill the same full width as assistant
     messages (the bubble background then spans the whole message column). */
  [data-phase] [class*="_userStack"],
  [data-phase] [class*="_userStack"] [class*="_bubble"] {
    box-sizing: border-box;
    width: fit-content;
    max-width: 100%;
  }

  /* --- Composer bottom row on mobile ---
     The official row contains two lanes: tools (plus + permission/mode
     controls) and trailing (model + context + send). The previous rules made
     the modes lane flex:none, so its full intrinsic width collided with the
     model selector on narrow phones. Keep fixed hit targets fixed, but let
     text-bearing controls shrink and ellipsize before they paint over the
     trailing lane. */
  /* The home indicator belongs to the composer seat, not the AppFrame. The
     seat is the only element anchored to the bottom of an active conversation
     (position: sticky; bottom: 0); a margin-bottom on the input card clears
     only that card's own box, so the composer content still rides over the
     gesture bar. The AppFrame must never own the inset or it changes the
     absolute sidebar drawer's containing block / clips its settings panel.
     Padding the seat's bottom (viewport-fit=cover makes
     env(safe-area-inset-bottom) the real indicator height) lifts the whole
     composer footer above the home indicator. */
  [data-phase="active"] [data-composer-seat] {
    padding-bottom: max(12px, env(safe-area-inset-bottom, 0px)) !important;
  }
  [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) {
    box-sizing: border-box;
    container-type: inline-size;
    container-name: dsh-mobile-composer;
    flex-wrap: nowrap;
    gap: 6px;
    padding-left: 6px;
    padding-right: 6px;
    /* The dropdown menu is absolutely positioned inside this row; any
       overflow: hidden here would clip it. Inner lanes keep their own
       overflow clipping, so the row itself can stay visible. */
    overflow: visible;
  }
  [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) > :first-child {
    flex: 0 1 auto;
    min-width: 0;
    gap: 6px;
    /* The permission dropdown (Menu, side: top) pops upward from inside the
       tools lane; overflow hidden here would crop it, same as the row. Text
       ellipsis is handled by the trigger label itself. */
    overflow: visible;
  }
  [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) > [class*="_trailing"] {
    flex: 1 1 auto;
    min-width: 0;
    gap: 6px;
    /* Must not clip the model dropdown; the model trigger clips its own label. */
    overflow: visible;
  }
  /* PermissionSelect / plan controls share the tools lane. Let the
     permission label use the remaining tools width, while the lower-priority
     plan slot keeps an icon-sized target instead of stealing model width. */
  [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) > :first-child > :nth-child(2) {
    flex: 0 1 auto;
    min-width: 0;
    max-width: none;
    gap: 4px;
    /* The permission Menu list (side: top) pops upward out of this lane;
       overflow hidden crops it. The trigger label clips its own text. */
    overflow: visible;
  }
  [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) > :first-child > :nth-child(2) > [class*="_trigger"] {
    flex: 1 1 auto;
    min-width: 28px;
    max-width: 100%;
    display: flex !important;
    overflow: hidden;
  }
  [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) > :first-child > :nth-child(2) > [class*="_trigger"] > [class*="_triggerLabel"] {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap !important;
  }
  /* Slot wrappers such as the live plan chip are not trigger elements. Do
     not force them into an icon-sized box: their child button would overflow
     that wrapper and paint over PermissionSelect. Keep the wrapper intrinsic;
     the model lane below is the one that sacrifices width. */
  [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) > :first-child > :nth-child(2) > :not([class*="_trigger"]) {
    flex: 0 1 auto;
    min-width: 34px;
    max-width: max-content;
    overflow: visible;
  }
  [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) > :first-child > :nth-child(2) > [class*="_wrap"] > [class*="_chip"] {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap !important;
  }
  @container dsh-mobile-composer (max-width: 359px) {
    [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) > :first-child > :nth-child(2) > [class*="_trigger"] > [class*="_triggerLabel"] {
      display: none !important;
    }
  }
  /* Model selector: flexible and shrinkable, but never clipped.
     The root must be overflow:visible so the dropdown menu can render.
     The trigger itself clips the label text. */
  [data-phase] [class*="_card"]:has(textarea) [class*="_root"]:has(> [class*="_trigger"][aria-haspopup="menu"]) {
    flex: 0 1 auto;
    min-width: 0;
    overflow: visible;
  }
  @container dsh-mobile-composer (max-width: 359px) {
    [data-phase] [class*="_card"]:has(textarea) [class*="_root"]:has(> [class*="_trigger"][aria-haspopup="menu"]) {
      flex-basis: auto;
    }
  }
  [data-phase] [class*="_card"]:has(textarea) [class*="_root"]:has(> [class*="_trigger"][aria-haspopup="menu"]) > [class*="_trigger"] {
    display: flex !important;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    overflow: hidden;
  }
  [data-phase] [class*="_card"]:has(textarea) [class*="_root"]:has(> [class*="_trigger"][aria-haspopup="menu"]) > [class*="_trigger"] > [class*="_triggerLabel"] {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap !important;
  }
  [data-phase] [class*="_card"]:has(textarea) [class*="_root"]:has(> [class*="_trigger"]):not(:has(> [class*="_trigger"][aria-haspopup="menu"])) {
    flex: 0 0 auto;
  }

  /* Model switcher menu: center the dropdown on the now-shrinkable trigger,
     but never let it exceed the viewport on narrow phones. */
  [data-phase] [class*="_card"]:has(textarea) [class*="_root"]:has(> [class*="_trigger"]) > [class*="_menu"] {
    left: 50% !important;
    right: auto !important;
    transform: translateX(-50%) !important;
    max-width: min(320px, calc(100vw - 16px));
    box-sizing: border-box;
  }

  /* --- Fix composer row overflow at narrow widths (320px-360px) ---
     Force every direct child of the tools and trailing lanes to shrink,
     so they can fit within the available space without causing horizontal
     overflow. The fixed-size icon buttons are exempt: officially both are
     flex:none at a fixed size (plus 28x28, send 34x34) and must stay put,
     not participate in adaptation. */
  [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) > :first-child > :not([class*="_add"]) {
    flex-shrink: 1;
    min-width: 0;
  }
  [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) > [class*="_trailing"] > :not([class*="_primary"]) {
    flex-shrink: 1;
    min-width: 0;
  }
  /* Pin the plus button at the left edge of the tools lane: official
     flex:none 28x28, never squeezed by narrower viewports. */
  [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) > :first-child > [class*="_add"] {
    flex: none;
  }
  /* The context meter in the trailing lane is another fixed-size icon
     control: its trigger is officially width:28px flex:none, but the root
     itself is shrinkable, so a squeezed root lets the trigger paint over
     the pinned send button. Keep the whole meter at its natural size; its
     trigger uses aria-haspopup="dialog", so the model-selector menu rules
     (keyed on "menu") still do not apply. */
  [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) > [class*="_trailing"] > [class*="_root"] {
    flex: none;
    min-width: 0;
  }
  /* ContextMeter (JObwrW_ hash family) right-cluster pinning: keep the meter
     at its official size (28x28 trigger, 14px ring -- enlarging the ring made
     it steal attention) and glue it to the send button. A small negative
     right margin trims the 6px lane gap to 2px against send. Anchor on the
     unique aria-haspopup="dialog" trigger (no other composer control uses
     it), not the hashed class, so an upstream hash bump cannot silently
     unhook us. Knob: margin-right trim (-4px). */
  [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) > [class*="_trailing"] > [class*="_root"]:has(> [class*="_trigger"][aria-haspopup="dialog"]) {
    margin-right: -4px;
  }
  /* The model pill joins the same right cluster: its margin-left:auto absorbs
     ALL trailing slack, so the adaptive void sits between the tools lane and
     the pill (visible on wide phones/tablets), while [pill][meter][send] stay
     welded together at the right edge on every width. Descendant combinator
     on purpose: the pill root sits behind a display:contents wrapper, so a
     direct-child combinator silently misses (probe-verified). Within the
     trailing lane aria-haspopup="menu" belongs to the model trigger alone. */
  [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) > [class*="_trailing"] [class*="_root"]:has(> [class*="_trigger"][aria-haspopup="menu"]) {
    margin-left: auto;
    margin-right: -4px;
  }
  /* Shrink only the trigger BOX (28 -> 24, padding zeroed) while the ring
     ink stays at its official 14px: the dead inset per side drops from 7px
     to 5px so the small ring no longer floats in its own button. 24x24 keeps
     the WCAG 2.2 minimum target size. Ring size itself is intentionally
     untouched -- enlarging it was rejected as attention-grabbing. */
  [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) > [class*="_trailing"] > [class*="_root"]:has(> [class*="_trigger"][aria-haspopup="dialog"]) > [class*="_trigger"] {
    width: 24px;
    height: 24px;
    padding: 0;
  }
  /* Pin the send button to the right edge of the trailing lane.
     The model pill's margin-left:auto (rule above) is the primary slack
     absorber that keeps [pill][meter][send] welded at the right edge; this
     margin-left:auto only remains as the fallback for states where neither
     the pill nor the meter renders. The :has override zeroes it whenever
     either control is present, so two autos can never split the void and
     float the pill mid-lane. */
  [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) > [class*="_trailing"] > [class*="_primary"] {
    flex: none;
    margin-left: auto;
  }
  [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) > [class*="_trailing"]:has([class*="_trigger"][aria-haspopup="menu"], > [class*="_root"] > [class*="_trigger"][aria-haspopup="dialog"]) > [class*="_primary"] {
    margin-left: 0;
  }

  /* --- Session header on mobile ---
     Keep the host-owned metadata in one responsive row. The conversation
     title and running/subagent status keep their lanes; the mode text is the
     first to ellipsize when space runs out, while Files keeps its hit area. */
  [data-mobile-nav="frame"] [data-phase] header {
    padding-left: 16px;
    padding-right: 8px;
  }
  [data-mobile-nav="frame"] [data-phase] header > :first-child {
    display: flex !important;
    align-items: center;
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    gap: 2px;
    padding-left: 20px;
  }
  [data-mobile-nav="frame"] [data-phase] header > :first-child > :first-child {
    display: flex !important;
    align-items: center;
    flex: 1 1 auto;
    min-width: 0;
    gap: 2px;
  }
  /* The directory toggle stays at the far left of the header. */
  [data-mobile-nav="toggle"] {
    position: absolute !important;
    left: 8px !important;
    top: 12px !important;
    z-index: 2 !important;
  }
  /* Files remains in flow and is ordered as the rightmost plugin action. */
  [data-mobile-nav="files"] {
    position: static !important;
    left: auto !important;
    right: auto !important;
    top: auto !important;
    z-index: auto !important;
  }
  [data-mobile-nav="frame"] [data-phase] header [class*="_headerActions"] {
    display: flex !important;
    align-items: center;
    box-sizing: border-box;
    flex: 0 1 auto;
    min-width: 0;
    max-width: calc(100% - 32px);
    margin-left: auto;
    justify-content: flex-end;
    gap: 2px;
  }
  /* The title takes the remaining width and never paints outside it; the
     metadata lane's mode text is what shrinks first. */
  [data-mobile-nav="frame"] [data-phase] header [class*="_crumbs"] {
    flex: 1 1 0;
    min-width: 0;
    max-width: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap !important;
  }
  /* Mode label: preserve its icon and scale with the viewport — it yields
     space to the title and subagent status first, but can use more width on
     wider screens up to 220px before ellipsizing. */
  [data-mobile-nav="frame"] [data-phase] header [class*="_label"]:has(> svg) {
    order: 1;
    flex: 0 1 auto;
    min-width: 0;
    max-width: min(22vw, 220px);
    display: block;
    position: relative;
    box-sizing: border-box;
    padding-left: 18px;
    padding-right: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap !important;
  }
  [data-mobile-nav="frame"] [data-phase] header [class*="_label"]:has(> svg) > svg {
    position: absolute !important;
    left: 0 !important;
    top: 50% !important;
    transform: translateY(-50%) !important;
  }
  /* Running/subagent controls keep their full status text and hit area; they
     do not give up width to the mode label. NOTE: the real subagent lineage
     root has class="ZKlsPq_root " — a TRAILING SPACE from the plugin's
     template-literal className — so [class*="_root"] never matches it. Use
     [class*="_root"] and exclude the switcher root ([class*="_switcherRoot"])
     so only the count/job roots get pinned (the switcher must stay shrinkable
     so its own title can ellipsize). */
  [data-mobile-nav="frame"] [data-phase] header [class*="_root"]:not([class*="_switcherRoot"]):has(> button[class*="_trigger"]) {
    order: 2;
    flex: 0 0 auto;
    min-width: max-content;
    max-width: max-content;
    white-space: nowrap !important;
    position: static;
  }
  [data-mobile-nav="frame"] [data-phase] header [class*="_root"]:not([class*="_switcherRoot"]):has(> button[class*="_trigger"]) > button,
  [data-mobile-nav="frame"] [data-phase] header [class*="_root"]:not([class*="_switcherRoot"]):has(> button[class*="_trigger"]) > button * {
    white-space: nowrap !important;
  }
  /* The lineage count's leading "/" (ZKlsPq_separator — official desktop
     chrome rendered only for a root session inside the crumbs) looks like a
     stray extra breadcrumb level on small screens; hide it. The crumbSep "/"
     between ancestry segments (subagent sessions) is a real separator and
     stays. */
  [data-mobile-nav="frame"] [data-phase] header [class*="_crumbs"] [class*="_separator"] {
    display: none !important;
  }
  [data-mobile-nav="frame"] [data-phase] header [data-mobile-nav="files"] {
    order: 3;
    flex: 0 0 28px;
    width: 28px;
  }
  /* Session log download: gone from the header row on mobile (the utilities
     seat holds only the session-log-export capsule). */
  [data-mobile-nav="frame"] [data-phase] header > :first-child > :last-child {
    display: none !important;
  }
  /* Header crowding on narrow phones.
     A background-job trigger in the header actions, or the subagent lineage
     count ("N subagents") living inside the crumbs nav, consumes the width the
     mode label would otherwise use. This squeezes the crumbs nav so hard that
     the subagent count is clipped by the nav's overflow:hidden — the text
     looks overwritten and the trigger's right edge stops being reliably
     tappable. Mode text is the lowest-priority item, so it is compressed
     first. The lineage root (dsh-client-ui-subagent) sits in the crumbs for
     BOTH running and idle descendants, so we key the guards on that root
     rather than the transient running-state dot — otherwise the count gets
     clipped again the moment agents go idle. Match roots with
     [class*="_root"] (the real class carries a trailing space; [class*="_root"]
     matches nothing). */
  @media (max-width: 440px) {
    [data-mobile-nav="frame"] [data-phase] header [class*="_crumbs"] {
      padding-right: 8px;
    }
    [data-mobile-nav="frame"] [data-phase] header [class*="_headerActions"]:has([class*="_root"]) [class*="_label"]:has(> svg),
    [data-mobile-nav="frame"] [data-phase] header:has([class*="_crumbs"] [class*="_root"]) [class*="_label"]:has(> svg) {
      max-width: 18px;
      min-width: 18px;
      padding-left: 18px;
      padding-right: 0 !important;
    }
  }
  /* When the subagent lineage (any state) AND a background job are present
     together, even the mode icon is not enough room by itself. Keep the full
     subagent count (the reported-overwritten text) by compacting the job
     trigger to its dot/chevron, and keep mode icon-only so the crumbs nav can
     also hold a small right-hand gap — the subagent text should never sit
     flush against the mode component. */
  @media (max-width: 559px) {
    [data-mobile-nav="frame"] [data-phase] header [class*="_crumbs"] {
      padding-right: 8px;
    }
    [data-mobile-nav="frame"] [data-phase] header:has([class*="_crumbs"] [class*="_root"]) [class*="_headerActions"] [class*="_root"]:not([class*="_switcherRoot"]):has(> button[class*="_trigger"]) [class*="_count"] {
      display: none !important;
    }
    [data-mobile-nav="frame"] [data-phase] header:has([class*="_crumbs"] [class*="_root"]):has([class*="_headerActions"] [class*="_root"]) [class*="_label"]:has(> svg) {
      max-width: 18px;
      min-width: 18px;
      padding-left: 18px;
      padding-right: 0 !important;
    }
  }
  @media (max-width: 359px) {
    [data-mobile-nav="frame"] [data-phase] header:has([class*="_crumbs"] [class*="_root"]):has([class*="_headerActions"] [class*="_root"]) [class*="_label"]:has(> svg) {
      display: none !important;
    }
  }
  /* Session header tab row (Chat / Trajectory / Memory / Skills / Todos /
     plugin tabs). Upstream tabs are white-space:normal with
     flex:0 1 auto + min-width:auto, so when the row is narrower than the sum
     of the tab labels each tab shrinks to its single-longest-word min-content
     and the label wraps to several lines, while the row overflows to the right
     and the last tab paints past the viewport (unreachable). Force one line
     and horizontal scroll so every tab keeps its full label and stays reachable.
     Uses [class*="tabs"] scoped to the session header and the > [class*="tab"]
     direct children so the better-sidebar [class*="tabBar"] family is never hit;
     guard the active variant (still a plain tab) out of none. */
  [data-mobile-nav="frame"] [data-phase] header [class*="tabs"] {
    flex: 0 1 auto !important;
    min-width: 0 !important;
    max-width: 100% !important;
    overflow-x: auto !important;
    overflow-y: hidden !important;
    white-space: nowrap !important;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  [data-mobile-nav="frame"] [data-phase] header [class*="tabs"]::-webkit-scrollbar {
    display: none;
  }
  [data-mobile-nav="frame"] [data-phase] header [class*="tabs"] > [class*="tab"] {
    flex: 0 0 auto !important;
    min-width: max-content !important;
    max-width: max-content !important;
    white-space: nowrap !important;
  }

  /* --- Header popovers on mobile (dsh-client-ui-jobs / dsh-client-ui-subagent) --- */
  /* The official entries sit in the session header actions. Their popovers
     are anchored to the trigger's left edge, so clamp them to the viewport. */
  [data-mobile-nav="frame"] [data-phase] header [class*="_menu"] {
    left: 8px !important;
    right: auto !important;
    width: min(336px, calc(100vw - 16px));
    max-width: none;
    max-height: min(420px, calc(100dvh - 120px));
  }
  /* --- Settings sheet moved to settings-sheet.css.ts (DSH-native bottom sheet) ---
     Legacy aria-modal sheet rules removed — see src/client/styles/settings-sheet.css.ts
     for panel:has(navList) bottom-sheet, pill tabs scroll, header h44 close 36, safe-area.
     Keep cubeRow compact (Appearance) for any modal on mobile. */
  [aria-modal="true"] [class*="_cubeRow"] {
    gap: 6px;
  }
  [aria-modal="true"] [class*="_cubeRow"] > * {
    flex: 1 1 0;
    flex-direction: row !important;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 8px;
    min-height: 0;
  }

  /* Fix for dsh-better-sidebar (npm: dsh-better-sidebar) — right panel on mobile:
     make it a drawer (92vw) instead of full-viewport (100vw) so the dimmed
     backdrop beside it is tappable to close — otherwise the 100vw panel hides
     the backdrop entirely and chat appears permanently covered with no
     affordance to dismiss. Also constrain height for keyboard inset and hide
     the desktop drag handle which would float over the drawer. */
  [data-dsh-panel-host] [data-dsh-panel] {
    width: min(92vw, 360px) !important;
    max-width: 92vw !important;
    /* Keep content below the notch/status bar like the left drawer; the host
       is viewport-fixed so env(safe-area-inset-top) is real notch height. */
    padding-top: env(safe-area-inset-top, 0px) !important;
    /* Bottom safe-area for home indicator; also allows keyboard inset handling. */
    padding-bottom: env(safe-area-inset-bottom, 0px) !important;
  }
  /* Fix for dsh-better-sidebar — hide desktop resize handles on mobile. */
  [data-dsh-panel-host] [data-dsh-panel] [class*="panelResize"],
  [data-dsh-panel-host] [data-dsh-panel] [class*="cornerHandle"] {
    display: none !important;
  }
  /* Fix for dsh-better-sidebar — float windows must not cover the whole
     viewport on phones; constrain them like the panel drawer. */
  [data-dsh-panel-host] [class*="floatWindow"] {
    max-width: 92vw !important;
    max-height: 80dvh !important;
  }
  /* Fix for dsh-better-sidebar — bottom panel is merged into the right drawer
     on narrow viewports (JS does not render it), but keep a CSS guard so any
     stray bottom panel never overlays the center column on mobile. */
  [data-dsh-panel-host] [data-dsh-bottom-panel] {
    display: none !important;
  }
  /* Fix for dsh-better-sidebar — while the right panel drawer is open on
     mobile, hide the floating toggle cluster: the drawer is 92vw and covers
     the right edge, so the cluster (z45) floats over the panel header and its
     "Collapse sidebar" button overlaps the modal. Closing stays reachable via
     the tappable backdrop on the 8vw exposed strip. When the drawer is closed
     (the panel carries nArs4W_panelHidden) the cluster is shown again to
     reopen. Both the cluster and panel are direct children of
     [data-dsh-panel-host]. */
  [data-dsh-panel-host]:not(:has([class*="panelHidden"])) [data-dsh-toggle-cluster] {
    display: none !important;
  }
  /* Fix for dsh-better-sidebar — a mobile sheet (settings / explorer /
     preview) is a full-width aria-modal dialog. The floating toggle cluster is
     viewport-fixed at the top-right (z45), so once such a sheet is open it
     floats over the sheet's own top-right chrome (cf. the "Collapse sidebar"
     button overlapping the modal). The panel rule above only hides the cluster
     while the right panel drawer is open; this covers any modal that is NOT
     that panel (e.g. Settings opened from the left nav drawer), so the cluster
     disappears whenever an aria-modal dialog is present. */
  body:has([aria-modal="true"]) [data-dsh-toggle-cluster] {
    display: none !important;
  }
}

/* Fix for dsh-better-sidebar (npm: dsh-better-sidebar) — align the floating
   toggle cluster with the DSH header's session log button. Upstream places
   the cluster at top:3px, while the DSH header's actions sit at top:12-17px
   (center ~28px). With the cluster's 28px buttons, top:14px puts its center
   at 28px, visually aligned with the header's session log / headerActions
   and the crumb. Safe-area inset is preserved for notched devices. Applies
   to both mobile and desktop because the cluster is viewport-fixed. */
[data-dsh-toggle-cluster] {
  top: calc(14px + env(safe-area-inset-top, 0px)) !important;
}

/* Fix for dsh-better-sidebar (npm: dsh-better-sidebar) — align tabBar with
   the DSH header when the right panel is open. Upstream tabBar is 34px at
   y0 (center 17.5px) while the DSH header's interactive row is at top12-17
   (center 28px, session log button 32px at y12). Make the tabBar sit at the
   same 12px top with 32px height so its tabs share the header's baseline.
   Desktop only — mobile hides the tabBar behind the 92vw drawer. */
@media (min-width: 1024px) {
  /* The tabBar is the flex row; width 100% + align-items center so its tabs
     share the header's 12px-top baseline. Guard every selector that contains
     the "tabBar" or "tab" fragments with :not so the wider fragments
     (tabBarPlus / tabList / tabTitle / tabClose / tabBarRight) do not get
     re-matched by the shorter prefix — otherwise [class*="tab"] also hits
     nArs4W_tabList and stomps its flex-grow (see AGENTS.md prefix-overlap). */
  [data-dsh-panel] [class*="tabBar"]:not([class*="tabBarPlus"]):not([class*="tabBarRight"]) {
    height: 32px !important;
    min-height: 32px !important;
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    display: flex !important;
    flex: none !important;
    align-self: stretch !important;
    box-sizing: border-box !important;
    margin-top: 12px !important;
    margin-left: 0 !important;
    margin-right: 0 !important;
    padding-top: 0 !important;
    padding-bottom: 0 !important;
    padding-left: 12px !important;
    padding-right: 12px !important;
    align-items: center !important;
    justify-content: flex-start !important;
  }
  /* tabList grows to fill the tabBar (flex item, flex-grow 1). */
  [data-dsh-panel] [class*="tabBar"]:not([class*="tabBarPlus"]):not([class*="tabBarRight"]) [class*="tabList"] {
    height: 28px !important;
    min-height: 28px !important;
    flex: 1 1 auto !important;
    flex-grow: 1 !important;
    width: auto !important;
    min-width: 0 !important;
    align-items: center !important;
    gap: 8px !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
  }
  /* A single tab; guard every longer "tab"-fragment so this does not leak
     onto the tabList/tabTitle/tabClose/tabBarPlus siblings. */
  [data-dsh-panel] [class*="tabBar"]:not([class*="tabBarPlus"]):not([class*="tabBarRight"]) [class*="tab"]:not([class*="tabList"]):not([class*="tabTitle"]):not([class*="tabClose"]):not([class*="tabBarPlus"]):not([class*="tabBarRight"]) {
    height: 28px !important;
    min-height: 28px !important;
    flex: 0 1 auto !important;
    min-width: 0 !important;
    max-width: 180px !important;
    align-items: center !important;
    align-self: center !important;
  }
  [data-dsh-panel] [class*="tabBar"]:not([class*="tabBarPlus"]):not([class*="tabBarRight"]) [class*="tabTitle"] {
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
    min-width: 0 !important;
  }
  /* Fix for dsh-better-sidebar — New tab (+) button in the tabBar. Upstream
     renders it at 22x32 at y18 (center 34) while tabs are 80x18 at y19
     (center 28) — the + button sits 6px low and is not square. Make it a
     28px square and center it with the tabs. */
  [data-dsh-panel] [class*="tabBar"]:not([class*="tabBarRight"]) [class*="tabBarPlus"],
  [data-dsh-panel] [class*="tabBar"]:not([class*="tabBarRight"]) [class*="addTab"] {
    width: 28px !important;
    height: 28px !important;
    min-height: 28px !important;
    flex: none !important;
    margin: 0 !important;
    top: 0 !important;
    align-self: center !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
  }
}
`;
};
__modules["styles/misc.css.js"] = function (require, module, exports) {
"use strict";
// misc — split from src/client/mobile.css.ts (2026-08-16), order preserved.
// Self-contained: each section (composer / tablet / desktop) carries its own
// media query.
Object.defineProperty(exports, "__esModule", { value: true });
exports.MISC_CSS = void 0;
exports.MISC_CSS = `@media (max-width: 1023px) {
  /* ---------- hero composer on mobile ----------
     The official hero card carries a 2-line textarea plus a tall tool row,
     which reads oversized on a phone. Tighten the empty-state rhythm: keep
     the official centered hero, shrink the textarea line box, slim the card
     padding and the tool row, and close the gap under the headline. */

  [data-phase="hero"] [class*="_card"]:has(textarea) {
    padding-top: 6px !important;
    gap: 8px !important;
  }
  /* The official composer autosizes the textarea and writes an inline
     height (2 lines on the hero empty state) on the textarea's scroll/grow
     wrappers. :placeholder-shown lets us collapse the EMPTY state to one
     line with !important; as soon as the user types, the pseudo-class no
     longer matches and the autosizer's inline height takes over again — so
     multi-line growth keeps working. */
  [data-phase="hero"] textarea:placeholder-shown {
    height: 28px !important;
  }
  [data-phase="hero"] [class*="_card"]:has(textarea:placeholder-shown) > [class*="_scroll"],
  [data-phase="hero"] [class*="_card"]:has(textarea:placeholder-shown) [class*="_grow"] {
    height: 28px !important;
  }
  [data-phase="hero"] [class*="_card"]:has(textarea) > [class*="_row"] {
    padding-top: 2px !important;
  }
  [data-phase="hero"] [class*="_headline"] {
    line-height: 1.15 !important;
    margin-bottom: 0 !important;
  }
  [data-phase="hero"] [class*="_stack"] {
    gap: 0 !important;
  }

  /* ---------- composer dock: swap git branch chip with the todo card ----------
     The git-graph branch chip (conversation.input.dock, order 100) floats
     alone at the bottom-left above the input card, with a dead zone to its
     right; the full-width todo card (order 0) sits above it. Swap them so
     the chip reads as the stack's top row and the todo card fills the row
     above the composer. The dock container itself is display:contents
     (inline style) — its children are direct flex items of the composer
     stack, so order on the children is what reorders them. Only the chip
     needs an order change: -1 puts it before the todo card (order 0) and
     before the input card (order 0, later in DOM). The todo card must KEEP
     its order 0 — raising it past the input card's order 0 would drop it
     below the composer entirely (2026-08-16 regression, fixed). The queue
     strip (order 20) keeps hugging the input card. Desktop untouched (this
     block lives inside the max-width: 1023px media query). */
  [data-slot="conversation.input.dock"] [data-gitgraph-chip-anchor] {
    order: -1 !important;
  }
  /* Mobile tap target + feedback for the branch chip (git-graph, 24px
     desktop spec). Two real-world problems: ① the chip is tiny and sits
     right above the expandable todo card — mis-taps land on the todo card;
     ② opening the popover waits for the host's /git/branches round-trip
     (~700ms on device) with zero feedback, so users tap again and toggle
     the popover closed. Enlarge the target, kill double-tap zoom delay,
     and give an instant pressed state so a tap reads as registered. */
  [data-slot="conversation.input.dock"] [data-gitgraph-chip-anchor] [data-gitgraph-chip] {
    touch-action: manipulation !important;
    min-height: 34px !important;
    padding: 0 12px !important;
    font-size: 13px !important;
  }
  [data-slot="conversation.input.dock"] [data-gitgraph-chip-anchor] [data-gitgraph-chip]:active {
    transform: scale(.96) !important;
    transition: transform .12s !important;
  }

  /* ---------- ask question composer (ask_user_question): kill iOS Safari
      input-focus auto-zoom ----------
      Safari on iPhone enlarges the whole viewport when a focused <input> /
      <textarea> computes font-size < 16px, and only reverts on blur. The ask
      dialog is a modal composer takeover, so taps outside never blur the
      field and the magnification persists until the field loses focus
      (e.g. the dialog is dismissed). The ask
      composer's custom-answer <input> (.customInput) and optionless free-form
      <textarea> (.customTextarea) both ship at 14px (ui-user-questions
      QuestionComposer.module.css). Raise them to 16px on mobile so Safari
      sees a >=16px field and skips the zoom entirely. Scoped to the ask
      composer's stable [data-question-key] root (AGENTS.md: scope hashed-class
      selectors to the owning region, prefer stable data-* markers); the
      class-name suffix match follows the plugin's established harness
      CSS-module convention (verified against the live app: generated names
      end with the original local name, e.g. uV2eYG_input / qDHVXG_searchInput). */
  [data-question-key] [class*="_customInput"],
  [data-question-key] [class*="_customTextarea"] {
    font-size: 16px !important;
  }

  /* ---------- new-session hero preset menu: prevent top cutoff on long lists ----------
     Host Menu (ui-primitives/Menu.tsx) measures lh from calc(100vh - 24px) but
     clamps with innerHeight (dynamic viewport) using
     Math.min(Math.max(y,12),vh-lh-12). When 100vh > innerHeight (mobile Safari
     with address bar, notch) lh exceeds vh and the clamp inverts to a negative
     top, so the first presets render above the viewport. dvh tracks the dynamic
     viewport, so the measured lh matches the clamp's vh; keep the 100vh
     fallback for engines without dvh and include safe-area insets. */
  body > div[role="menu"] {
    max-height: calc(100vh - 24px) !important;
    max-height: calc(100dvh - 24px) !important;
    max-height: calc(100dvh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) !important;
  }

  /* ---------- drawer session tree: skip off-screen rendering ----------
     content-visibility: auto lets engine skip layout/paint of off-screen rows
     when drawer closed (early-commit) and of off-screen rows in long history. */
  [data-mobile-nav="frame"] > :first-child [role="tree"] {
    content-visibility: auto;
    contain-intrinsic-size: auto 600px;
  }
}

/* ---------- tablet / wide mobile: keep sheets from becoming full-width ----------
   Below 768px the near-full-width sheets are the right call for a phone.
   On wider but still sub-desktop viewports (foldables, tablet portrait,
   desktop-mode tall windows) the same full-bleed sheet leaves content
   clustered at the left edge with a large dead zone on the right. Cap and
   center the modal sheets and the aionui bottom sheets instead. */
@media (min-width: 768px) and (max-width: 1023px) {
  /* All modal dialogs: centered, never edge-to-edge. The settings sheet has
     a higher-specificity full-width rule above, so repeat its selector here
     to win; the generic export/other-modal rule is covered by the second
     selector. */
  [aria-modal="true"]:has(> :first-child > :last-child > button):not(:has([role="navigation"])):not(:has([class*="ZuhsRW"])),
  [aria-modal="true"]:not(:has(> :first-child > :last-child > button)) {
    left: 0 !important;
    right: 0 !important;
    margin-left: auto !important;
    margin-right: auto !important;
    width: min(calc(100vw - 32px), 720px) !important;
    max-width: min(calc(100vw - 32px), 720px) !important;
  }

  /* The dsh-web-ui explorer / preview bottom sheets: same treatment — keep
     the mobile bottom-sheet behavior, but stop them spanning the full width. */
  [data-aionui-explorer-col],
  [data-aionui-preview-col] {
    left: 0 !important;
    right: 0 !important;
    width: min(calc(100vw - 32px), 720px) !important;
    margin-left: auto !important;
    margin-right: auto !important;
  }

  /* Settings sections (e.g. Agent presets) often carry a desktop max-width
     (720px) that leaves a dead strip on the right once the sheet is capped to
     the same width; let them fill the sheet body instead. */
  [aria-modal="true"] [class*="_section"] {
    width: 100% !important;
    max-width: none !important;
  }
}

/* ---------- desktop: the mobile controls must never appear ---------- */

@media (min-width: 1024px) {
  [data-mobile-nav="toggle"],
  [data-mobile-nav="files"],
  [data-mobile-nav="fab"],
  [data-mobile-nav="backdrop"],
  [data-mobile-nav="right-backdrop"],
  [data-mobile-nav="session-log"],
  [data-mobile-nav="explorer"],
  [data-mobile-nav="drawer-actions"] {
    display: none !important;
  }
}
`;
};
__modules["styles/sheet.css.js"] = function (require, module, exports) {
"use strict";
// sheet — DSH-native bottom sheet (reuses Modal tokens)
// See design-system/MASTER.md
Object.defineProperty(exports, "__esModule", { value: true });
exports.SHEET_CSS = void 0;
exports.SHEET_CSS = `
/* ---------- BottomSheet (DSH Modal bottom-sheet variant) ---------- */
[data-mobile-sheet="root"] {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0;
}
[data-mobile-sheet="mask"] {
  position: absolute;
  inset: 0;
  background: var(--dsw-alias-bg-mask-1, rgba(0,0,0,.24));
  backdrop-filter: var(--dsw-mask-blur, blur(2px));
  animation: dsh-maestro-mobile-fade .18s var(--ds-ease-out, ease-in-out);
}
[data-mobile-sheet="dialog"] {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 100%;
  max-height: min(55dvh, 460px);
  padding: 10px 0 calc(12px + env(safe-area-inset-bottom, 0px));
  background: var(--dsw-alias-bg-layer-2, #fff);
  border: 1px solid var(--dsw-alias-border-inverted, rgba(0,0,0,.08));
  border-radius: 24px 24px 0 0;
  box-shadow: var(--dsw-shadow-lv3, 0 8px 32px rgba(0,0,0,.18));
  animation: dsh-maestro-mobile-sheet-in .22s var(--ds-ease-out, ease-in-out);
}
[data-mobile-sheet="handle"] {
  align-self: center;
  width: 36px;
  height: 4px;
  margin: 2px 0 10px;
  border-radius: 999px;
  background: var(--dsw-alias-border-l2, rgba(0,0,0,.22));
}
[data-mobile-sheet="header"] {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 14px 8px 24px;
}
[data-mobile-sheet="title"] {
  margin: 0;
  font-size: 16px;
  line-height: 24px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary, #111);
}
[data-mobile-sheet="close"] {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #666);
  cursor: pointer;
}
[data-mobile-sheet="close"]:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.06));
}
[data-mobile-sheet="body"] {
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 0 24px;
  min-height: 0;
}
@media (min-width: 768px) and (max-width: 1023px) {
  [data-mobile-sheet="dialog"] {
    width: min(calc(100vw - 32px), 720px);
    border-radius: 24px;
    margin: 0 auto 12px;
  }
}
@media (prefers-reduced-motion: reduce) {
  [data-mobile-sheet="mask"],
  [data-mobile-sheet="dialog"] {
    animation: none !important;
  }
}
@media (min-width: 1024px) {
  [data-mobile-sheet="root"] {
    align-items: center;
    padding: 24px;
  }
  [data-mobile-sheet="dialog"] {
    width: min(380px, 100%);
    max-height: min(80dvh, 640px);
    border-radius: 24px;
  }
}
`;
};
__modules["styles/explorer-sheet.css.js"] = function (require, module, exports) {
"use strict";
// explorer-sheet — DSH-native bottom sheets for aionui explorer/preview
// Reuses BottomSheet tokens: --dsw-alias-bg-layer-2, --dsw-shadow-lv3, --ds-ease-out
// See design-system/pages/sheet.md
// Consolidated from legacy compat.css.ts — core visibility + geometry retained, polish migrated to DSH tokens
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXPLORER_SHEET_CSS = void 0;
exports.EXPLORER_SHEET_CSS = `
@media (max-width: 1023px) {
  /* Core: both cols leave grid as floating panels */
  [data-aionui-explorer-col],
  [data-aionui-preview-col] {
    position: fixed !important;
    z-index: 55 !important;
    background: var(--dsw-alias-bg-layer-2, var(--aion-bg-base, #fff)) !important;
    border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.12)) !important;
    border-left: none !important;
    box-shadow: var(--dsw-shadow-lv3, 0 -4px 28px rgba(0,0,0,.18)) !important;
    animation: dsh-maestro-mobile-sheet-in .22s var(--ds-ease-out, ease-in-out) !important;
  }
  [data-aionui-explorer-col] {
    visibility: hidden !important;
    left: 8px !important; right: 8px !important; top: auto !important; bottom: 36px !important;
    width: auto !important; height: min(55dvh, 460px) !important; max-height: calc(100dvh - 44px) !important;
    border-radius: 14px !important; overflow: hidden !important;
  }
  [data-aionui-preview-col] {
    visibility: hidden !important;
    left: 8px !important; right: 8px !important; top: auto !important; bottom: 40px !important;
    width: auto !important; height: min(50dvh, 420px) !important; max-height: calc(100dvh - 48px) !important;
    border-radius: 14px !important; overflow: hidden !important; z-index: 56 !important;
    transition: left .24s var(--ds-ease-out, ease-in-out), right .24s var(--ds-ease-out, ease-in-out), top .24s var(--ds-ease-out, ease-in-out), bottom .24s var(--ds-ease-out, ease-in-out), width .24s var(--ds-ease-out, ease-in-out), height .24s var(--ds-ease-out, ease-in-out), border-radius .24s var(--ds-ease-out, ease-in-out), box-shadow .24s var(--ds-ease-out, ease-in-out), padding-top .24s var(--ds-ease-out, ease-in-out) !important;
  }
  [data-mobile-nav="frame"][data-aionui-preview-open] [data-aionui-preview-col] { visibility: visible !important; }
  [data-mobile-nav="frame"][data-aionui-explorer-open] [data-aionui-explorer-col] { visibility: visible !important; }
  [data-mobile-nav="frame"][data-aionui-preview-open] [data-aionui-explorer-col] { visibility: hidden !important; }
  [data-mobile-nav="frame"]:not([data-sidebar-collapsed]) [data-aionui-explorer-col],
  [data-mobile-nav="frame"]:not([data-sidebar-collapsed]) [data-aionui-preview-col] { visibility: hidden !important; display: none !important; }
  .aionui-explorer-handle, .aionui-preview-handle { display: none !important; }
  .aionui-floating-expand { display: none !important; }
  /* Explorer search/header compact — reuse DSH Button/Input sizing */
  [data-aionui-explorer-col] [class*="_searchBox"] {
    border-radius: 12px !important;
    border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.12)) !important;
    background: var(--dsw-alias-bg-base, #fff) !important;
  }
  /* Preview tabs — keep DSH tab tokens, ensure ellipsis */
  [data-aionui-preview-col] [class*="_tabScroll"] {
    scrollbar-width: thin !important;
    scrollbar-color: var(--dsw-alias-label-tertiary, rgba(0,0,0,.3)) transparent !important;
  }
}
@media (prefers-reduced-motion: reduce) {
  [data-aionui-explorer-col],
  [data-aionui-preview-col] {
    animation: none !important;
  }
}
`;
};
__modules["styles/composer.css.js"] = function (require, module, exports) {
"use strict";
// composer — DSH-native composer row polish (container query)
// Reuses DSH composer card tokens: --dsw-alias-bg-layer-2, --dsw-alias-border-l1
// See design-system/pages/composer.md
Object.defineProperty(exports, "__esModule", { value: true });
exports.COMPOSER_CSS = void 0;
exports.COMPOSER_CSS = `
@media (max-width: 1023px) {
  /* Composer seat safe-area: reuse DSH composer card geometry */
  [data-phase="active"] [data-composer-seat] {
    padding-bottom: max(12px, env(safe-area-inset-bottom, 0px)) !important;
  }
  /* Row container query — DSH composer row is flex with dropdowns that must not clip */
  [data-phase] [class*="_card"]:has(textarea) [class*="_row"]:has([class*="_trailing"]) {
    container-type: inline-size;
    container-name: dsh-mobile-composer;
    gap: 6px !important;
    padding-left: 6px !important;
    padding-right: 6px !important;
    overflow: visible !important;
  }
  /* iOS Safari input-focus zoom guard — DSH ask_user_question inputs */
  [data-question-key] [class*="_customInput"],
  [data-question-key] [class*="_customTextarea"] {
    font-size: 16px !important;
  }
  /* Hide tooltips on touch — "Stop generating" lingers mid-screen after tap on mobile */
  [role="tooltip"] {
    display: none !important;
  }
  /* Ask question composer — fix Submit cutoff on narrow phones (user report 390px).
     The footer is a single row (pager + feedback flex:1 + actions) that overflows
     the card's 100% width on phones; feedback pushes actions off-screen. Wrap the
     footer so actions stay reachable. */
  [data-question-key] [class*="_frame"] {
    padding-left: 12px !important;
    padding-right: 12px !important;
  }
  [data-question-key] [class*="_card"] {
    max-width: 100% !important;
  }
  [data-question-key] [class*="_footer"] {
    flex-wrap: wrap !important;
    gap: 10px 12px !important;
    padding-left: 12px !important;
    padding-right: 12px !important;
  }
  [data-question-key] [class*="_feedback"] {
    flex: 1 1 100% !important;
    min-width: 0 !important;
    order: 3 !important;
    text-align: left !important;
  }
  [data-question-key] [class*="_footerActions"] {
    flex: 0 1 auto !important;
    justify-content: flex-end !important;
    width: auto !important;
    order: 2 !important;
    margin-left: auto !important;
  }
  [data-question-key] [class*="_pager"] {
    order: 1 !important;
  }
  /* Composer status bar (turns/steps/LLM/TPS) — single-line horizontal scroll on mobile */
  [data-mobile-nav="stats"] {
    display: flex !important;
    flex-wrap: nowrap !important;
    overflow-x: auto !important;
    overflow-y: hidden !important;
    -webkit-overflow-scrolling: touch !important;
    scrollbar-width: none !important;
    gap: 12px !important;
    white-space: nowrap !important;
    align-items: center !important;
    padding: 4px 12px 6px !important;
    box-sizing: border-box !important;
  }
  [data-mobile-nav="stats"]::-webkit-scrollbar {
    display: none !important;
  }
  [data-mobile-nav="stats"] > * {
    flex: 0 0 auto !important;
    white-space: nowrap !important;
  }
  /* Model dropdown centered, max 320px — DSH Menu tokens */
  [data-phase] [class*="_card"]:has(textarea) [class*="_root"]:has(> [class*="_trigger"]) > [class*="_menu"] {
    left: 50% !important;
    right: auto !important;
    transform: translateX(-50%) !important;
    max-width: min(320px, calc(100vw - 16px)) !important;
    background: var(--dsw-alias-bg-overlay, #fff) !important;
    border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.12)) !important;
    box-shadow: var(--dsw-shadow-lv3, 0 8px 24px rgba(0,0,0,.12)) !important;
    border-radius: 12px !important;
  }
}
`;
};
__modules["styles/settings-sheet.css.js"] = function (require, module, exports) {
"use strict";
// settings-sheet — DSH-native Settings modal → bottom sheet on mobile
// Reuses DSH SettingsRoot tokens: --dsw-alias-bg-layer-2, --dsw-alias-bg-mask-1, --dsw-mask-blur,
// --dsw-shadow-lv3, --dsw-alias-border-l1/l2/inverted, --dsw-alias-label-primary, --ds-ease-out
// See design-system/pages/settings.md
// Scope is SettingsRoot only: panel:has(navList) isolates Settings from other dialogs.
// Guard: [class*="_nav"] is prefix of _navTitle/_navList/_navCell/... — outer nav uses :not guards.
Object.defineProperty(exports, "__esModule", { value: true });
exports.SETTINGS_SHEET_CSS = void 0;
exports.SETTINGS_SHEET_CSS = `
@media (max-width: 1023px) {
  /* Overlay anchor: only when it hosts the Settings panel (panel:has(navList)) */
  [class*="_overlay"]:has([class*="_panel"]:has([class*="_navList"])) {
    align-items: flex-end !important;
    justify-content: center !important;
    padding: 0 !important;
  }
  [class*="_overlay"]:has([class*="_panel"]:has([class*="_navList"])) [class*="_mask"] {
    background: var(--dsw-alias-bg-mask-1, rgba(0,0,0,.24)) !important;
    backdrop-filter: var(--dsw-mask-blur, blur(2px)) !important;
    animation: dsh-maestro-mobile-fade .18s var(--ds-ease-out, ease-in-out) !important;
  }

  /* Panel: sheet — r24 top only, layer-2, lv3, handle 36x4, safe-area */
  [class*="_panel"]:has([class*="_navList"]) {
    position: relative !important;
    width: 100% !important;
    max-width: 100% !important;
    height: min(92dvh, 720px) !important;
    max-height: min(92dvh, 720px) !important;
    min-height: min(92dvh, 720px) !important;
    flex-direction: column !important;
    border-radius: 24px 24px 0 0 !important;
    background: var(--dsw-alias-bg-layer-2, #fff) !important;
    border: 1px solid var(--dsw-alias-border-inverted, rgba(0,0,0,.08)) !important;
    border-bottom: none !important;
    box-shadow: var(--dsw-shadow-lv3, 0 8px 32px rgba(0,0,0,.18)) !important;
    padding-top: 10px !important;
    animation: dsh-maestro-mobile-sheet-in .22s var(--ds-ease-out, ease-in-out) !important;
    --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2) !important;
    --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2) !important;
  }
  /* Drag handle — matches BottomSheet 36x4 centered */
  [class*="_panel"]:has([class*="_navList"])::before {
    content: '' !important;
    align-self: center !important;
    width: 36px !important;
    height: 4px !important;
    margin: 2px 0 10px !important;
    border-radius: 999px !important;
    background: var(--dsw-alias-border-l2, rgba(0,0,0,.22)) !important;
    flex: none !important;
    display: block !important;
  }

  /* Nav: vertical rail → horizontal pill tabs — guard prefix overlap */
  [class*="_panel"]:has([class*="_navList"]) [class*="_nav"]:not([class*="_navTitle"]):not([class*="_navList"]):not([class*="_navCell"]):not([class*="_navLabel"]):not([class*="_navIcon"]) {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    flex: none !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 6px !important;
    padding: 0 16px 0 16px !important;
    box-sizing: border-box !important;
    overflow: hidden !important;
  }
  [class*="_panel"]:has([class*="_navList"]) [class*="_navTitle"] {
    padding: 0 44px 2px 4px !important;
    font-size: 16px !important;
    line-height: 24px !important;
    font-weight: 500 !important;
    box-sizing: border-box !important;
    max-width: 100% !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }
  [class*="_panel"]:has([class*="_navList"]) [class*="_navList"] {
    display: flex !important;
    flex-direction: row !important;
    flex-wrap: nowrap !important;
    gap: 6px !important;
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    box-sizing: border-box !important;
    overflow-x: auto !important;
    overflow-y: hidden !important;
    scrollbar-width: none !important;
    -webkit-overflow-scrolling: touch !important;
    overscroll-behavior-x: contain !important;
    touch-action: pan-x !important;
    padding-bottom: 6px !important;
    margin-bottom: 0 !important;
    border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.08)) !important;
  }
  [class*="_panel"]:has([class*="_navList"]) [class*="_navList"]::-webkit-scrollbar {
    display: none !important;
    width: 0 !important;
    height: 0 !important;
  }
  [class*="_panel"]:has([class*="_navList"]) [class*="_navCell"] {
    flex: none !important;
    height: 36px !important;
    min-width: fit-content !important;
    padding: 0 14px !important;
    border-radius: 999px !important;
    border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.12)) !important;
    background: transparent !important;
    font-size: 13px !important;
    line-height: 20px !important;
    gap: 6px !important;
    cursor: pointer !important;
    -webkit-tap-highlight-color: transparent !important;
    white-space: nowrap !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
  }
  [class*="_panel"]:has([class*="_navList"]) [class*="_navCell"]:hover {
    background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.06)) !important;
  }
  [class*="_panel"]:has([class*="_navList"]) [class*="_navCell"].active,
  [class*="_panel"]:has([class*="_navList"]) [class*="_navCell"][class*="active"] {
    background: var(--dsw-specific-sidebar-nav-item-active, #EBEEF2) !important;
    border-color: var(--dsw-specific-sidebar-nav-item-active, #EBEEF2) !important;
    color: var(--dsw-alias-label-primary, #111) !important;
  }
  [class*="_panel"]:has([class*="_navList"]) [class*="_navCell"]:focus-visible {
    outline: 2px solid var(--dsw-alias-state-business-primary, #4f6ef7) !important;
    outline-offset: 1px !important;
  }

  /* Content column: header + scrollable options */
  [class*="_panel"]:has([class*="_navList"]) [class*="_content"] {
    flex: 1 !important;
    min-height: 0 !important;
    min-width: 0 !important;
    display: flex !important;
    flex-direction: column !important;
  }
  /* Header holds "Open configuration file" action; keep it compact tight under tabs — not a 44px bar */
  [class*="_panel"]:has([class*="_navList"]) [class*="_header"] {
    flex: none !important;
    height: auto !important;
    min-height: 0 !important;
    width: 100% !important;
    padding: 4px 16px 4px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: flex-end !important;
    gap: 8px !important;
    border: none !important;
    border-bottom: none !important;
    box-sizing: border-box !important;
  }
  [class*="_panel"]:has([class*="_navList"]) [class*="_header"]:empty {
    display: none !important;
    padding: 0 !important;
    min-height: 0 !important;
  }
  [class*="_panel"]:has([class*="_navList"]) [class*="_header"] [class*="_actions"] {
    margin-left: 0 !important;
    display: flex !important;
    align-items: center !important;
    gap: 8px !important;
    min-width: 0 !important;
    margin-right: auto !important;
  }
  /* Collapse the empty 44px gap entirely when header has no visible actions (only the now-absolute close) */
  [class*="_panel"]:has([class*="_navList"]) [class*="_header"]:has(> [class*="_actions"]:empty) {
    display: none !important;
    padding: 0 !important;
    min-height: 0 !important;
  }
  [class*="_panel"]:has([class*="_navList"]) [class*="_close"] {
    position: absolute !important;
    top: 12px !important;
    right: 12px !important;
    z-index: 2 !important;
    width: 36px !important;
    height: 36px !important;
    border-radius: 999px !important;
    flex: none !important;
    cursor: pointer !important;
    -webkit-tap-highlight-color: transparent !important;
  }
  [class*="_panel"]:has([class*="_navList"]) [class*="_close"]:hover {
    background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.06)) !important;
  }
  [class*="_panel"]:has([class*="_navList"]) [class*="_close"]:focus-visible {
    outline: 2px solid var(--dsw-alias-state-business-primary, #4f6ef7) !important;
    outline-offset: 1px !important;
  }
  [class*="_panel"]:has([class*="_navList"]) [class*="_options"] {
    flex: 1 !important;
    min-height: 0 !important;
    overflow-y: auto !important;
    -webkit-overflow-scrolling: touch !important;
    padding: 8px 16px calc(12px + env(safe-area-inset-bottom, 0px)) !important;
  }
  /* Bento: sections fill sheet on mobile */
  [class*="_panel"]:has([class*="_navList"]) [class*="_section"] {
    width: 100% !important;
    max-width: none !important;
  }
}

/* Tablet 768-1023: centered constrained sheet, r24 all corners */
@media (min-width: 768px) and (max-width: 1023px) {
  [class*="_overlay"]:has([class*="_panel"]:has([class*="_navList"])) {
    align-items: center !important;
    padding: 24px 16px calc(16px + env(safe-area-inset-bottom, 0px)) !important;
  }
  [class*="_panel"]:has([class*="_navList"]) {
    width: min(calc(100vw - 32px), 720px) !important;
    max-width: min(calc(100vw - 32px), 720px) !important;
    height: min(82dvh, 640px) !important;
    max-height: min(82dvh, 640px) !important;
    min-height: min(82dvh, 640px) !important;
    border-radius: 24px !important;
    border: 1px solid var(--dsw-alias-border-inverted, rgba(0,0,0,.08)) !important;
    margin: 0 auto !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  [class*="_overlay"]:has([class*="_panel"]:has([class*="_navList"])) [class*="_mask"],
  [class*="_panel"]:has([class*="_navList"]) {
    animation: none !important;
  }
}

@media (min-width: 1024px) {
  [class*="_panel"]:has([class*="_navList"])::before {
    display: none !important;
  }
}
`;
};
__modules["styles/tokens.css.js"] = function (require, module, exports) {
"use strict";
// tokens — DSH-native design tokens reference (no custom hex).
// This file documents the token contract; it emits no CSS itself.
// All values resolve through DSH ThemePresenter (light/dark via body[data-ds-dark-theme]).
// See design-system/MASTER.md for the full list.
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOKENS_CSS = void 0;
exports.TOKENS_CSS = `
/* DSH tokens consumed by dsh-maestro-mobile (reference only — no output) */
/* --dsw-alias-bg-base, --dsw-alias-bg-layer-2, --dsw-alias-bg-overlay */
/* --dsw-alias-bg-mask-1 + --dsw-mask-blur */
/* --dsw-alias-border-l1, --dsw-alias-border-l2, --dsw-alias-border-inverted */
/* --dsw-alias-label-primary, --dsw-alias-label-secondary, --dsw-alias-label-tertiary */
/* --dsw-alias-brand-primary, --dsw-alias-state-business-primary */
/* --dsw-alias-interactive-bg-hover, --dsw-alias-interactive-bg-active */
/* --dsw-alias-button-primary-fill, --dsw-alias-button-floating-fill */
/* --dsw-specific-sidebar-fill */
/* --ds-ease-in-out, --ds-ease-out, --ds-transition-duration-slow */
/* --dsw-shadow-lv3 */
/* env(safe-area-inset-top), env(safe-area-inset-bottom) */
`;
};
__modules["styles/index.js"] = function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MOBILE_CSS = void 0;
const base_css_ts_1 = require("./styles/base.css.js");
const layout_css_ts_1 = require("./styles/layout.css.js");
const misc_css_ts_1 = require("./styles/misc.css.js");
const sheet_css_ts_1 = require("./styles/sheet.css.js");
const explorer_sheet_css_ts_1 = require("./styles/explorer-sheet.css.js");
const composer_css_ts_1 = require("./styles/composer.css.js");
const settings_sheet_css_ts_1 = require("./styles/settings-sheet.css.js");
const tokens_css_ts_1 = require("./styles/tokens.css.js");
/**
 * All mobile styles, concatenated in DSH-native order:
 * tokens → base → layout → sheet → explorer-sheet → composer → settings-sheet → misc
 * Legacy compat.css.ts deleted — essential aionui visibility migrated to explorer-sheet.css.ts,
 * remaining compat polish (market/better-sidebar/taskboard) removed for core DSH mobile support.
 * Overlay fix: drawer z150 above shell.overlay so session rows remain tappable.
 */
exports.MOBILE_CSS = [tokens_css_ts_1.TOKENS_CSS, base_css_ts_1.BASE_CSS, layout_css_ts_1.LAYOUT_CSS, sheet_css_ts_1.SHEET_CSS, explorer_sheet_css_ts_1.EXPLORER_SHEET_CSS, composer_css_ts_1.COMPOSER_CSS, settings_sheet_css_ts_1.SETTINGS_SHEET_CSS, misc_css_ts_1.MISC_CSS].join('\n');
};
__modules["effects/subagent-chip-touch.js"] = function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.installSubagentChipTouch = installSubagentChipTouch;
const phone_chrome_ts_1 = require("./effects/phone-chrome.js");
/**
 * Touch support for the lineage-count chip ("N 个子代理") that
 * `dsh-client-ui-subagent` renders in the session header.
 *
 * Upstream history (both observed live on the served bundle):
 *
 * 1. The original count-variant trigger shipped without an onClick handler
 *    (`onClick: openTitle === void 0 ? void 0 : …`) and drove its card purely
 *    through onMouseEnter/onMouseLeave hover timers — enter arms a 150 ms
 *    open timer, leave arms a 120 ms close timer, and each cancels the
 *    other. On touch devices every tap makes the browser synthesize paired
 *    mouseenter/mouseleave from its tracked mouse position, which usually
 *    differs from the tap point: taps did nothing, or the card popped back
 *    open ~200 ms after an outside close (the “点了没反应 / 自弹回” era,
 *    hash ZKlsPq).
 *
 * 2. 0.1.0-rc.6 (hash h8S2Va) removed the hover timers and gave the trigger
 *    a native `onClick: () => changeOpen(!open)`. A phone tap now crosses
 *    TWO toggle sources: the browser fires pointerup first (this shim
 *    dispatches the synthetic ArrowDown there, capture phase — BEFORE the
 *    click), which opens the card through the component's own keyboard
 *    path, and then the tap's click reaches the native onClick, which
 *    toggles the card right back shut. The two toggles cancel each other:
 *    the panel flashes open for a frame and is gone (「闪退」), and the
 *    chip reads as unresponsive.
 *
 * Fix strategy, scoped to touch pointers (mouse users keep native hover):
 * 1. Toggle the card ourselves along the component's own keyboard path —
 *    ArrowDown keydown on the trigger opens (+focus first row), Escape
 *    closes (both verified against the live component in both upstream
 *    versions). React delivers dispatched KeyboardEvents to onKeyDown like
 *    any bubbling event.
 * 2. Swallow the tap's own follow-up click on the trigger we just toggled,
 *    so a native onClick (era 2) can never cancel the keyboard-path
 *    toggle. On the hover-only build the click never toggled anything, so
 *    swallowing it is a no-op — one deterministic toggle per tap across
 *    both upstreams.
 * 3. For a short window after every touch pointer activity, swallow trusted
 *    synthesized mouseover/out/enter/leave events targeting the lineage
 *    root or its menu, so era-1 hover timers can neither cancel our toggle
 *    nor resurrect a just-closed card (no-op on rc.6, which has no hover
 *    timers at all).
 */
/** Count-variant trigger only: the switcher variant has its own onClick. */
const CHIP_TRIGGER_SELECTOR = '[data-mobile-nav="frame"] button[class*="_trigger"][aria-haspopup="tree"][aria-expanded]:not([class*="_switcherTrigger"])';
/**
 * Lineage root plus its menu. NOTE: `ZKlsPq` (hover-only era) and `h8S2Va`
 * (0.1.0-rc.6) are the dsh-client-ui-subagent CSS-module hashes — audit
 * these selectors when the package upgrades.
 */
const HOVER_SUBTREE_SELECTOR = '[class*="ZKlsPq_root"], [class*="ZKlsPq_menu"], [class*="h8S2Va_root"], [class*="h8S2Va_menu"]';
/** How long after touch activity synthesized hover events stay suppressed. */
const SWALLOW_WINDOW_MS = 800;
/**
 * How long the tap's follow-up click stays suppressed on the trigger we
 * toggled through the keyboard path. A touch click lands a few ms after its
 * pointerup; 1 s is a generous upper bound that still expires before the
 * user's next deliberate tap.
 */
const CLICK_GRACE_MS = 1000;
const SWALLOWED_TYPES = ['mouseover', 'mouseout', 'mouseenter', 'mouseleave'];
function installSubagentChipTouch(ctx) {
    (0, phone_chrome_ts_1.installMobileEffect)(ctx, 'dsh-maestro-mobile: lineage chip touch toggle', () => {
        if (typeof PointerEvent === 'undefined')
            return undefined;
        let swallowUntil = 0;
        const armSwallowWindow = () => {
            swallowUntil = Date.now() + SWALLOW_WINDOW_MS;
        };
        // The trigger whose tap we just toggled through the keyboard path, and
        // how long that tap's follow-up click must be suppressed on it.
        let toggledTrigger = null;
        let toggledUntil = 0;
        const onPointerUp = (event) => {
            if (event.pointerType !== 'touch' && event.pointerType !== 'pen')
                return;
            armSwallowWindow();
            const target = event.target;
            if (!(target instanceof Element))
                return;
            const trigger = target.closest(CHIP_TRIGGER_SELECTOR);
            if (trigger === null)
                return;
            const open = trigger.getAttribute('aria-expanded') === 'true';
            // The component's own keyboard path: navigate() treats ArrowDown as
            // open (+focus first row) and Escape as close-with-focus-restore.
            trigger.dispatchEvent(new KeyboardEvent('keydown', {
                key: open ? 'Escape' : 'ArrowDown',
                bubbles: true,
                cancelable: true,
            }));
            toggledTrigger = trigger;
            toggledUntil = Date.now() + CLICK_GRACE_MS;
        };
        /**
         * The tap's own click must not re-toggle the trigger: on 0.1.0-rc.6 the
         * trigger carries a native onClick (changeOpen(!open)) that would cancel
         * the keyboard-path toggle fired on pointerup — the flash-and-close
         * race. stopPropagation() at document capture blocks the click from
         * reaching the container-level React delegation (so the trigger's
         * onClick never runs) while letting other document listeners observe it.
         * Identity-checked, so taps on menu rows or anywhere else pass through
         * untouched.
         */
        const onClick = (event) => {
            if (toggledTrigger === null)
                return;
            if (Date.now() >= toggledUntil) {
                toggledTrigger = null;
                return;
            }
            const target = event.target;
            if (!(target instanceof Element))
                return;
            if (target.closest(CHIP_TRIGGER_SELECTOR) !== toggledTrigger)
                return;
            toggledTrigger = null;
            event.stopPropagation();
        };
        const onAnyPointerActivity = (event) => {
            if (event.pointerType !== 'touch' && event.pointerType !== 'pen')
                return;
            armSwallowWindow();
            void event;
        };
        const swallowSyntheticHover = (event) => {
            if (Date.now() >= swallowUntil)
                return;
            if (!event.isTrusted)
                return;
            const target = event.target;
            if (!(target instanceof Element))
                return;
            if (target.closest(HOVER_SUBTREE_SELECTOR) === null)
                return;
            event.stopImmediatePropagation();
        };
        document.addEventListener('pointerdown', onAnyPointerActivity, true);
        document.addEventListener('pointerup', onPointerUp, true);
        document.addEventListener('click', onClick, true);
        for (const type of SWALLOWED_TYPES) {
            document.addEventListener(type, swallowSyntheticHover, true);
        }
        return () => {
            document.removeEventListener('pointerdown', onAnyPointerActivity, true);
            document.removeEventListener('pointerup', onPointerUp, true);
            document.removeEventListener('click', onClick, true);
            for (const type of SWALLOWED_TYPES) {
                document.removeEventListener(type, swallowSyntheticHover, true);
            }
        };
    });
}
};
__modules["effects/layout-bridge.js"] = function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.installLayoutBridge = installLayoutBridge;
const phone_chrome_ts_1 = require("./effects/phone-chrome.js");
/**
 * Layout bridge: reuses DSH's own breakpoint (SIDEBAR_AUTO_COLLAPSE=1024)
 * instead of duplicating it. Observes the layout store indirectly via
 * matchMedia + frame marker, so drawer state stays in sync with AppFrame's
 * narrow detection. Keeps data-mobile-nav="frame" as a compat marker for
 * existing CSS while the style migration completes.
 * @param ctx - client root context.
 */
function installLayoutBridge(ctx) {
    ctx.effect(() => {
        const narrow = window.matchMedia(phone_chrome_ts_1.MOBILE_QUERY);
        let frame = null;
        const ensureFrame = () => {
            frame = (0, phone_chrome_ts_1.findFrame)();
            if (frame !== null && !frame.hasAttribute('data-mobile-nav')) {
                frame.setAttribute('data-mobile-nav', 'frame');
            }
            return frame;
        };
        const sync = () => {
            const f = ensureFrame();
            if (f === null)
                return;
            // DSH AppFrame already manages data-sidebar-collapsed via its own
            // narrowExpanded store; we just ensure the frame marker exists so
            // mobile CSS selectors remain functional during migration.
            // No extra state is written — AppFrame is the source of truth.
        };
        sync();
        const mo = new MutationObserver(sync);
        mo.observe(document.documentElement, { childList: true, subtree: true });
        const onChange = () => sync();
        narrow.addEventListener('change', onChange);
        return () => {
            mo.disconnect();
            narrow.removeEventListener('change', onChange);
            // Do not clear data-mobile-nav here — frame-controller owns it.
        };
    }, 'dsh-maestro-mobile: layout bridge (reuse DSH AppFrame)');
}
};
__modules["effects/viewport.js"] = function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.installViewportBridge = installViewportBridge;
const phone_chrome_ts_1 = require("./effects/phone-chrome.js");
/**
 * Viewport + theme-color bridge: reuses DSH ThemePresenter where possible.
 * On narrow screens: viewport-fit=cover so env(safe-area-inset-*) is real;
 * theme-color tracks body background via DSH's theme/change event when
 * available, falling back to getComputedStyle.
 * @param ctx - client root context.
 */
function installViewportBridge(ctx) {
    ctx.effect(() => {
        const narrow = window.matchMedia(phone_chrome_ts_1.MOBILE_QUERY);
        const viewport = document.querySelector('meta[name="viewport"]');
        const originalViewport = viewport?.content ?? '';
        let themeMeta = null;
        const ensureThemeMeta = () => {
            if (themeMeta !== null)
                return themeMeta;
            const m = document.createElement('meta');
            m.name = 'theme-color';
            themeMeta = m;
            return m;
        };
        const bodyBg = () => getComputedStyle(document.body).backgroundColor;
        const sync = () => {
            if (narrow.matches && viewport !== null) {
                const locked = /(^|,)\s*maximum-scale\s*=/.test(viewport.content);
                viewport.content = `width=device-width, initial-scale=1${locked ? ', maximum-scale=1' : ''}, viewport-fit=cover`;
            }
            if (narrow.matches) {
                const m = ensureThemeMeta();
                m.content = bodyBg();
                if (m.parentElement === null)
                    document.head.appendChild(m);
            }
            else {
                themeMeta?.remove();
            }
        };
        const restore = () => {
            if (viewport !== null)
                viewport.content = originalViewport;
            themeMeta?.remove();
            themeMeta = null;
        };
        const onGestureStart = (event) => event.preventDefault();
        // Prefer DSH theme/change event if available; fall back to MutationObserver
        let offTheme;
        try {
            const maybeOn = ctx.on;
            if (typeof maybeOn === 'function') {
                offTheme = maybeOn.call(ctx, 'theme/change', () => {
                    if (themeMeta !== null)
                        themeMeta.content = bodyBg();
                });
            }
        }
        catch {
            // ctx.on not available in this context — fall back to observer
        }
        const observer = new MutationObserver(() => {
            if (themeMeta !== null)
                themeMeta.content = bodyBg();
        });
        observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
        document.addEventListener('gesturestart', onGestureStart);
        sync();
        const onChange = () => sync();
        narrow.addEventListener('change', onChange);
        return () => {
            observer.disconnect();
            offTheme?.();
            document.removeEventListener('gesturestart', onGestureStart);
            narrow.removeEventListener('change', onChange);
            restore();
        };
    }, 'dsh-maestro-mobile: viewport bridge (reuse DSH ThemePresenter)');
}
};
__modules["effects/sidebar-swipe.js"] = function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startZonePxFor = startZonePxFor;
exports.classifySwipe = classifySwipe;
exports.slidingVelocity = slidingVelocity;
exports.hitTestStart = hitTestStart;
exports.followTranslate = followTranslate;
exports.followOpenTransform = followOpenTransform;
exports.findHorizontalScroller = findHorizontalScroller;
exports.installSidebarSwipe = installSidebarSwipe;
const phone_chrome_ts_1 = require("./effects/phone-chrome.js");
const gesture_guard_ts_1 = require("./effects/gesture-guard.js");
const overlay_backdrop_fab_ts_1 = require("./effects/overlay-backdrop-fab.js");
/**
 * Sidebar drawer swipe gestures (B 档 hybrid follow, per the 2026-08-29
 * controlled upgrade of docs/specs/2026-08-27-sidebar-swipe-gestures.md).
 *
 * Three gestures:
 * - edge swipe-in: the pointer goes down within the start zone (45% of the
 *   left edge) and the drawer is closed → the host state is flipped AT
 *   AXIS-LOCK (early commit) while the drawer is pinned in its closed slot,
 *   so the REAL open subtree mounts off-screen and then follows the finger
 *   out of the slot (see startFollow for why the flip has to come first);
 * - content swipe-toward-slot: the pointer goes down inside the open drawer
 *   and drags LEFT (LTR) → the drawer FOLLOWS the finger (inline translateX,
 *   transition:none) and releases into the host's transition;
 * - content swipe-out (legacy): drag RIGHT inside the open drawer → no
 *   follow (A 档 semantics preserved verbatim), release classifies.
 *
 * The release decision is UNCHANGED from A 档: classifySwipe (distance ratio
 * OR recent-window velocity) — after a follow stroke, dx IS the followed
 * position, so the same function decides complete vs spring-back. The commit
 * is still just `ctx.layout.toggleSidebar()`. The follow mechanics ride the
 * host transition instead of fighting it: during the stroke the drawer gets
 * inline `transition: none` + translateX; on release the inline styles are
 * dropped and the commit retargets the host transition IN THE SAME TASK (no
 * paint in between), so the drawer animates from the finger position to the
 * final state with zero custom animation code.
 *
 * Review constraints honored (spec 2026-08-27 second review): the backdrop
 * stays binary (appears at commit — never opacity-followed, 缺陷 2); a modal
 * rising mid-stroke reverts the drawer every move event (缺陷 1's per-frame
 * guard); the OPEN final state must end with transform:none (the containing
 * block invariant for fixed descendants) — a transitionend-free cleanup pair
 * (inline clear + host value) guarantees it because the host open rule is
 * transform:none. No gesture-layer DOM, no setPointerCapture. Zero transform
 * writes remain true for the LEGACY rightward-close path.
 *
 * Coexistence with the host's overlay interactions (document capture click /
 * pointerup) is two-layered via gesture-guard.ts: (1) tryLock publishes an
 * axis-lock flag the instant the stroke locks horizontal — during
 * pointermove, strictly before any pointerup — and the host handlers yield
 * on it first, because they are registered EARLIER and the post-release
 * consume marks do not exist yet on the stroke's own release event (audit
 * S0: the host toggled first and the gesture toggled back, net zero);
 * (2) a classified swipe additionally marks its target chain consumed so
 * the synthetic click after the stroke can never toggle twice or navigate
 * a row.
 */
/**
 * Start-zone width as a FRACTION of the viewport width: the pointer counts
 * as "from the left edge" anywhere inside the left (RTL: right) strip this
 * wide. Fifth tuning pass (2026-08-29, user preference "识别区再扩宽到约占
 * 总宽的 45%"): the fixed 96px strip still missed landings beyond it, and
 * the user wants the sloppy, anywhere-in-the-left-half feel of native apps.
 * History of the constant: 24px (hotspot era) → 48px (third pass, fixed
 * "识别成对话内容滚动") → 96px (fourth pass — at that point the zone also
 * finally cleared Chrome Android's EDGE_WIDTH_DP=48dp history-navigation
 * trigger strip, whose strokes the browser claims and pointercancels; the
 * browser gesture itself is suppressed by the root overscroll-behavior-x:
 * none rule in layout.css.ts) → 0.45×viewport (fifth pass, this value).
 * Safety at this width: the release classification (0.16×w travel OR
 * 0.45px/ms velocity) still gates the commit, so widening cannot open on a
 * tap; vertical strokes reset at axis lock (≤8px of prevented movement) and
 * hand scrolling back; strokes beginning inside genuinely horizontally
 * scrollable containers are excluded from the zone entirely — see
 * findHorizontalScroller (at 45% the stats line / message code blocks sit
 * well inside the strip, so that guard is load-bearing).
 */
const START_ZONE_RATIO = 0.45;
/**
 * The zone in pixels for a given viewport width (pure, exported for the
 * decision-table tests). Rounded so the probe boundary assertions stay
 * integral (390px → Math.round(175.5) = 176).
 */
function startZonePxFor(viewportWidthPx, ratio = START_ZONE_RATIO) {
    return Math.round(viewportWidthPx * ratio);
}
/**
 * Axis-lock threshold: once the stroke's dominant axis has moved this far,
 * the axis is decided. Horizontal-dominant (|dx| > |dy|) locks the stroke
 * to X (a swipe); vertical-dominant abandons it to native scrolling.
 * Replaces the old 4px slop + 1.5× direction-bias pair — a 1.5× bias
 * rejected natural ~45° diagonal swipes (the other half of the
 * "识别成滚动" report). MUI uses a 3px uncertainty threshold; 8px is a
 * comfortable margin against tap jitter while still deciding in the first
 * ~16ms of movement.
 */
const LOCK_PX = 8;
/** Distance thresholds as a fraction of the viewport width.
 *  Second tuning pass (2026-08-27, "识别成滚动" feedback): 0.16 open = ~62px
 *  on a 390px phone, 0.13 close = ~51px. Keep the open threshold above the
 *  close threshold so an accidental reverse swipe cannot re-open. */
const OPEN_DISTANCE_RATIO = 0.16;
const CLOSE_DISTANCE_RATIO = 0.13;
/** Velocity window: most-recent-60ms instantaneous speed (end-segment slope). */
const VELOCITY_WINDOW_MS = 60;
/** px/ms speed thresholds for open / close (MUI uses 0.45). */
const OPEN_VELOCITY = 0.45;
const CLOSE_VELOCITY = 0.45;
/** Covers the .28s CSS transition; prevents reverse-gesture double-toggles. */
const COOLDOWN_MS = 350;
/** How long a consumed gesture mark stays live (covers the synthetic click).
 * Short by design: browsers dispatch the synthetic click within tens of ms,
 * while iOS shells suppress it entirely — a long window with no delivery
 * would let the marks swallow the user's next genuine tap (dead-tap bug).
 * When upTo is absent from the release chain (edge swipe-in releases over
 * the main content) the mark walk reaches the document root, so this short
 * window is also the bound on how long any tap can be suppressed. */
const CONSUME_WINDOW_MS = 300;
/**
 * Rightward travel (from the stroke start) that arms the OPEN follow, i.e.
 * flips the host state early so the real drawer subtree mounts. Slightly
 * above LOCK_PX so an 8px horizontal twitch inside the wide start zone does
 * not mount-and-unmount 389 nodes; small enough that the dead zone before
 * the drawer's edge appears is imperceptible.
 */
/** The open follow arms at the AXIS LOCK itself: tryLock already demanded
 * 8px of horizontal-dominant travel, so no extra twitch margin is needed —
 * every pixel between lock and arm was dead drag (user report 2026-08-29
 * 「右滑的过程中最开始有真空期,有一段卡的地方」). The release verdict still
 * decides the outcome, so arming early cannot commit a false open. */
const OPEN_FOLLOW_ARM_PX = 8;
/**
 * The host's closed-slot offset as a PERCENTAGE of the drawer's own width
 * (`transform: translateX(-110%)` — the 10% overshoot hides the drawer's
 * shadow). Percentages are load-bearing for the open follow: the element
 * width changes mid-stroke when React swaps the collapsed rail for the real
 * drawer, and a percentage re-resolves against the current width while a
 * cached px value would not.
 */
const CLOSED_SLOT_PCT = 110;
/** Duration of the self-run terminal close animation. Matches the host's
 * .28s drawer transition so the handoff feels identical. */
const COMMIT_ANIM_MS = 280;
/** Percentage baseline of the OPEN-direction follow. The host's closed slot
 * is -110%, but following from -110% hides the first 28px of travel (the
 * 10% overshoot of the 280px drawer): the drawer stayed invisible until
 * ~dx=28 — user report 「刚开始会卡一下，之后才会拖出来」(measured: first
 * paint at dx=12 was left=-296, edge reached the viewport only at dx=28).
 * 101% keeps a small hidden margin (subpixel safety, would-be sliver at
 * exactly -100%) so the drawer edge answers the finger right after the
 * axis lock: at the 8px arm the edge is already ~5px on-screen (-102% left
 * only 2.4px and read as a vacuum; -110% hid the first 28px entirely).
 * The closed slot itself is only ever needed at TERMINAL states,
 * where CLOSED_SLOT_PCT is used verbatim. */
const OPEN_FOLLOW_BASE_PCT = 101;
/** Pointer id we are tracking (multi-touch is ignored). */
let trackingPointer = 0;
/** True once the stroke is axis-locked (direction bias passed). */
let tracking = false;
/** Stroke samples (x + timestamp) for the recent-window velocity. */
let samples = [];
/** Stroke origin (for the direction-bias check). */
let startX = 0;
let startY = 0;
/** Drawer visibility at lock time. */
let lockDrawerOpen = false;
/** Expiry of the post-release cooldown (performance.now()). */
let cooldownUntil = 0;
/** Element whose stroke was marked consumed (null = no live mark). */
let consumedEl = null;
/** B 档 follow state — one cache per stroke, set once at lock time so the
 * per-move writes never read layout (the spec review's rAF-contention
 * constraint). followDrawer stays bound for the whole stroke so a
 * released-then-re-engaged stroke (direction wobble) reuses the cache. */
let followDrawer = null;
let followEngaged = false;
let strokeClosedTx = 0;
let strokeRtl = false;
/** True while an OPEN stroke has early-committed the host state (the drawer
 * subtree is mounted but pinned in its slot, following the finger). The
 * release must then either keep it open or toggle it back. */
let openFollowArmed = false;
/** True once an open stroke has decided NOT to arm the follow (aborted arm:
 * a modal/takeover veto, a missing drawer) so it never retries mid-stroke. */
let openFollowRefused = false;
/**
 * Pure decision: what does this stroke do, given the drawer state?
 * `dx`/`dy` are raw pointer deltas (RTL mirrors X through `rtl`), `velX` is
 * the raw recent-window X velocity. The stroke must be locked horizontal
 * (|dx| > |dy| and past the lock slop) and direction-consistent; then
 * distance OR velocity wins, with the drawer-state-specific threshold.
 */
function classifySwipe(t, m, rtl) {
    // RTL mirrors the X axis: a rightward stroke (positive dx in LTR) is
    // leftward in RTL. Normalize to the logical direction before judging.
    const dx = rtl ? -m.dx : m.dx;
    if (Math.abs(dx) <= t.lockPx)
        return 'none';
    if (Math.abs(dx) <= Math.abs(m.dy))
        return 'none';
    if (t.drawerOpen) {
        // BOTH horizontal directions close (2026-08-29 sixth round, user report
        // 「根本没法左滑关闭」). Leftward is the natural "push it back into its
        // slot" gesture — and the only one the follow animation actually paints
        // (followTranslate's close branch follows leftward), so refusing it made
        // the drawer track the finger and then spring back, i.e. the animation
        // promised a close the classifier would not honor. Rightward stays
        // accepted verbatim: four tuning rounds of muscle memory ride on it and
        // failure scenarios B0/B1/B2 assert it. Nothing else competes for a
        // horizontal stroke while the drawer is open, so accepting both costs no
        // ambiguity.
        const travel = Math.abs(dx);
        if (travel / t.viewportWidthPx >= t.closeDistanceRatio)
            return 'close';
        const velX = rtl ? -m.velX : m.velX;
        // A fling only counts when it agrees with the stroke's own direction
        // (same contradiction guard the open branch applies).
        if (velX > 0 !== dx > 0)
            return 'none';
        return Math.abs(velX) >= t.closeVelocity ? 'close' : 'none';
    }
    if (dx <= 0)
        return 'none';
    if (dx / t.viewportWidthPx >= t.openDistanceRatio)
        return 'open';
    const velX = rtl ? -m.velX : m.velX;
    return velX >= t.openVelocity ? 'open' : 'none';
}
/**
 * Recent-window instantaneous velocity (px/ms) from the tail of the last
 * `windowMs` milliseconds of samples, up to `now`. Sliding X per ms between
 * the LAST TWO in-window samples — the end-of-stroke slope — so a long slow
 * drag then a quick flick reports the flick, not the drag average. Samples
 * older than the window are ignored. Fewer than two in-window samples → 0.
 */
function slidingVelocity(samples, windowMs, now) {
    const cutoff = now - windowMs;
    const inWindow = samples.filter((s) => s.t >= cutoff);
    if (inWindow.length < 2)
        return 0;
    const a = inWindow[inWindow.length - 2];
    const b = inWindow[inWindow.length - 1];
    const dt = b.t - a.t;
    if (dt <= 0)
        return 0;
    return (b.x - a.x) / dt;
}
/**
 * Geometric start-hit test: the pointer went down in the left edge start
 * zone (when the drawer is closed) or inside the drawer content area (when
 * open). Pure and viewport-relative so it is unit-testable; the runtime
 * variant additionally checks the drawer geometry via the DOM.
 */
function hitTestStart(clientX, viewportWidthPx, rtl, t) {
    const edge = rtl ? viewportWidthPx - clientX : clientX;
    return edge >= 0 && edge <= t.startZonePx;
}
/**
 * Pure follow mapping (B 档): the translateX (px) to paint for a stroke
 * sample, or null when THIS sample has no follow. `closedTx` is the signed
 * closed-slot translateX (negative LTR, positive RTL — the drawer slides
 * off the anchored edge); `dx` is the RAW pointer delta; normalization
 * mirrors classifySwipe (`d = rtl ? -dx : dx`, rightward-logical positive =
 * toward open).
 *
 * Decision table (C3 hybrid, 2026-08-29 user decision):
 * - close stroke (drawer open): LEFTWARD-logical travel drags the drawer
 *   toward its closed slot, clamped at the slot; rightward-logical → null
 *   (the legacy A 档 close owns that direction — no follow, momentum-honest);
 * - open stroke (drawer closed): NOT used at runtime — the open direction
 *   follows through `followOpenTransform` instead, because its baseline has
 *   to stay a percentage across the subtree swap (see that function). The px
 *   mapping is kept pure and tested as the reference semantics;
 * - a zero closed slot (degenerate host without a closed transform) yields
 *   a constant 0 — the follow degrades to a no-op instead of inventing
 *   travel.
 */
function followTranslate(closedTx, dx, rtl, drawerOpen) {
    const dir = closedTx <= 0 ? -1 : 1;
    const slot = Math.abs(closedTx);
    const d = rtl ? -dx : dx;
    if (drawerOpen) {
        if (d >= 0)
            return null;
        // + 0 normalizes -0 (dir=-1 times a clamped 0) so strict equality in the
        // decision table and in probe comparisons sees a plain zero.
        return dir * Math.min(slot, -d) + 0;
    }
    if (d <= 0)
        return null;
    return dir * (slot - Math.min(slot, d)) + 0;
}
/**
 * Pure follow mapping for the OPEN direction (B 档, 2026-08-29 second pass).
 * Returns the CSS transform to paint for a stroke that has already
 * early-committed the host state, or null when this sample has no follow
 * (leftward-logical travel, i.e. pulled back past the stroke origin).
 *
 * The baseline is the host's own PERCENTAGE slot (`translateX(-110%)`), kept
 * symbolic on purpose: at arm time the element is still the ~206px collapsed
 * rail and a frame later React has swapped in the ~280px drawer. A px
 * baseline captured before the swap would leave the wider drawer 74px
 * off-position (its slot is -308px, not -227px); `-110%` re-resolves against
 * the element's current width on every frame, so the same declaration is
 * correct across the mount. `min()`/`max()` clamp the open end so overshoot
 * cannot drag the drawer past its resting position.
 */
function followOpenTransform(travelPx, rtl) {
    const t = rtl ? -travelPx : travelPx;
    if (t <= 0)
        return null;
    return rtl
        ? `translateX(max(0px, calc(${OPEN_FOLLOW_BASE_PCT}% - ${t}px)))`
        : `translateX(min(0px, calc(-${OPEN_FOLLOW_BASE_PCT}% + ${t}px)))`;
}
/**
 * Pure walk: the innermost element of the chain (self included) that is a
 * GENUINELY horizontally scrollable container — overflow-x auto/scroll AND
 * content actually overflowing (scrollWidth > clientWidth + 1; the +1
 * absorbs subpixel rounding). A stroke beginning inside one belongs to that
 * scroller: the browser claims the horizontal pan (pointercancel on real
 * devices) and the release classification must neither compete with it nor
 * preventDefault it away — prevention is what would break the strip's native
 * scrolling near the left edge once the start zone grew to 45% of the
 * viewport (the stats
 * line spans the full width; message code blocks are overflow-x:auto too).
 * CDP failure scenario C1 pins this contract. overflow-x:hidden/clip never
 * match: clipped content cannot pan, so a horizontal stroke there stays free
 * for the gesture layer.
 */
function findHorizontalScroller(node) {
    let cur = node;
    while (cur !== null) {
        if ((cur.overflowX === 'auto' || cur.overflowX === 'scroll') &&
            cur.scrollWidth > cur.clientWidth + 1) {
            return cur;
        }
        cur = cur.parent;
    }
    return null;
}
/** The open drawer element: first child of the plugin frame. */
function findDrawer() {
    const frame = (0, phone_chrome_ts_1.getFrame)();
    return frame !== null && frame.firstElementChild instanceof HTMLElement
        ? frame.firstElementChild
        : null;
}
/** True when the drawer is currently open (per the collapsed marker). */
function drawerOpen() {
    const frame = (0, phone_chrome_ts_1.getFrame)();
    return frame !== null && !frame.hasAttribute('data-sidebar-collapsed');
}
/**
 * Map the real DOM ancestor chain (target first, root last) onto the plain
 * SwipeChainNode shape findHorizontalScroller walks. Bounded by the document
 * depth (~15 nodes in this app) and run once per pointerdown, so the
 * getComputedStyle calls are not a per-frame cost.
 */
function chainFrom(target) {
    let node = null;
    let el = target;
    while (el !== null) {
        node = {
            parent: node,
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
            overflowX: getComputedStyle(el).overflowX,
        };
        el = el.parentElement;
    }
    return node;
}
/** Whether a modal dialog owns the screen (gestures must yield to it). */
function modalOpen() {
    return document.querySelector('[aria-modal="true"]') !== null;
}
/** True when a full-screen takeover (taskboard / ssh) owns the frame. */
function takeoverActive() {
    return (document.documentElement.hasAttribute('data-dsh-taskboard-active') ||
        document.documentElement.hasAttribute('data-dsh-ssh-active'));
}
/** Whether the swipe layer is on cooldown (animation in flight). */
function onCooldown() {
    return performance.now() < cooldownUntil;
}
/**
 * Cache the follow geometry for a freshly locked stroke. Runs ONCE per
 * stroke (one getComputedStyle, plus one getBoundingClientRect only for the
 * cold-start fallback); the per-move path afterwards is write-only.
 *
 * CLOSE strokes follow from a px baseline read here. OPEN strokes cannot:
 * the host renders TWO different subtrees in the same sidebar column —
 * collapsed it is a ~206px rail holding only Task Board / SSH / Files /
 * Session log (79 nodes, ZERO `role=treeitem`), open it is the ~280px drawer
 * with the session tree and footer (389 nodes, 15 treeitems). Dragging the
 * closed column would only reveal the rail (measured 2026-08-29, the user's
 * "完全不同的 UI、没有真实会话、位置全乱" report). The open direction therefore
 * commits FIRST and follows AFTER (armOpenFollow), which is also why its
 * baseline must stay a percentage rather than a px value cached here.
 */
function startFollow() {
    // Unbind first: followDrawer survives across strokes (endStroke releases
    // the styles AFTER reset(), so reset must not clear it). Without this an
    // open stroke would inherit the binding left by the previous close-follow
    // and start following after all — exactly what the probe assertion
    // swipe.open-stroke-no-follow catches.
    followDrawer = null;
    followEngaged = false;
    openFollowArmed = false;
    openFollowRefused = false;
    // strokeRtl is read by the OPEN branch of applyFollow BEFORE it arms, so it
    // must be refreshed for every locked stroke — not only the close branch —
    // or an open stroke would inherit the previous stroke's reading direction.
    strokeRtl = frameRtl();
    const drawer = findDrawer();
    if (drawer === null)
        return;
    // A closed stroke binds nothing here: the OPEN direction early-commits and
    // binds inside armOpenFollow, using a percentage baseline (the element's
    // width changes when React swaps the rail for the real drawer).
    if (!lockDrawerOpen)
        return;
    followDrawer = drawer;
    // The slot is 110% of the element's OWN width (the host's closed rule is
    // translateX(-110%), the extra 10% covering any shadow).
    //
    // Measuring the OPEN drawer is load-bearing (2026-08-29 seventh round,
    // user report 「左滑的时候会卡一下…会突然有出现半开不开的样子」 →
    // 「UI 会停在我最终滑动的地方，之后消失」). The previous baseline was a
    // slot observed on the CLOSED host, i.e. on the ~206px nav rail
    // (~-226.7px) — but the drawer being dragged is ~280px and parks at
    // ~-308px. followTranslate clamps at the slot, so the drag froze 81px
    // short of the edge: the drawer stopped under a still-moving finger
    // (「半开不开」), and the release then had to travel that remainder,
    // reading as a stall followed by a disappearance.
    //
    // Width is stable for the duration of a close stroke (no subtree swap
    // until the release commits), so a px baseline is safe here — unlike the
    // open direction, which must stay percentage-based because React swaps the
    // rail for the real drawer mid-stroke.
    const slot = (drawer.getBoundingClientRect().width * CLOSED_SLOT_PCT) / 100;
    strokeClosedTx = strokeRtl ? slot : -slot;
}
/**
 * Arm the OPEN follow: pin the drawer in its closed slot with an important
 * inline pair, THEN flip the host state in the same task. React mounts the
 * real ~280px drawer subtree while our inline transform holds it off-screen,
 * so the next move samples slide the genuine drawer — session tree and all —
 * out of the slot under the finger. Ordering matters: pin before the flip,
 * or the host's open rule (`transform: none`) paints the drawer at rest for
 * one frame and the user sees it snap into place before the follow starts.
 *
 * The backdrop and the FAB swap at the flip, which is the documented binary
 * behavior (spec review 缺陷 2: no opacity-following backdrop).
 */
/** True while the drawer subtree layout+paint is deliberately deferred by
 * the arm-time content-visibility split (see armOpenFollow). */
let cvDeferred = false;
/** Re-materialize the drawer contents after the mount-frame split. */
function revealDrawerContent() {
    if (!cvDeferred)
        return;
    cvDeferred = false;
    followDrawer?.style.removeProperty('content-visibility');
    const el = findDrawer();
    if (el !== null && el !== followDrawer)
        el.style.removeProperty('content-visibility');
}
function armOpenFollow(ctx) {
    if (openFollowArmed || openFollowRefused)
        return;
    const drawer = findDrawer();
    if (drawer === null || modalOpen() || takeoverActive()) {
        openFollowRefused = true;
        return;
    }
    followDrawer = drawer;
    followEngaged = true;
    drawer.style.setProperty('transition', 'none', 'important');
    const pinned = followOpenTransform(0.0001, strokeRtl);
    drawer.style.setProperty('transform', pinned ?? `translateX(-${CLOSED_SLOT_PCT}%)`, 'important');
    // Split the mount cost (2026-08-29, user report 「滑动不会立刻生效，而是卡
    // 那么零点几秒」): the toggle below synchronously mounts the 389-node
    // drawer subtree, and reconcile + style + layout + paint all land in ONE
    // long task — measured 308ms at 4x CPU throttle, a quarter-second of
    // frozen screen on a phone. content-visibility:hidden (set BEFORE the
    // flip, on the column that survives the subtree swap) makes the mount
    // frame skip subtree layout+paint — the panel BOX still paints and the
    // compositor keeps following the finger — and the contents materialize
    // two frames later via revealDrawerContent(), where the motion masks the
    // second (smaller) block. Ignored by browsers without support (no-op).
    drawer.style.setProperty('content-visibility', 'hidden', 'important');
    cvDeferred = true;
    openFollowArmed = true;
    ctx.layout.toggleSidebar();
    requestAnimationFrame(() => {
        requestAnimationFrame(revealDrawerContent);
    });
}
/**
 * Paint this move sample's follow position. Null mapping (legacy direction
 * or pulled back past the stroke origin) releases the inline styles so the
 * host transition is live again — the drawer springs to wherever the host
 * state puts it and the classification still owns the release. Re-engaging
 * after a null sample rewrites both inline properties, which also
 * self-heals anything that restored them mid-stroke (React re-render).
 *
 * Both properties MUST be written with `important` priority. The open state
 * is styled by our own `transform: none !important` (layout.css.ts — the
 * containing-block rule for the settings overlay), which outranks a plain
 * inline declaration: a normal `style.transform = ...` leaves the computed
 * transform at `none` and the drawer never moves. That is exactly how the
 * first follow implementation shipped invisible while every inline-string
 * assertion passed (2026-08-29) — assert COMPUTED transform, never
 * `element.style.transform`.
 */
function applyFollow(ctx, dx) {
    if (!tracking)
        return;
    if (!lockDrawerOpen) {
        // OPEN direction: arm past the twitch threshold, then follow with the
        // percentage baseline (the element's width changes across the mount).
        const travel = strokeRtl ? -dx : dx;
        if (!openFollowArmed) {
            if (travel < OPEN_FOLLOW_ARM_PX)
                return;
            armOpenFollow(ctx);
            if (!openFollowArmed)
                return;
        }
        const value = followOpenTransform(dx, strokeRtl);
        if (value === null) {
            // Pulled back past the origin: hold the drawer parked in its slot
            // rather than releasing (releasing would let the host animate it open
            // behind the finger). The release still classifies and may revert.
            followDrawer?.style.setProperty('transform', `translateX(-${CLOSED_SLOT_PCT}%)`, 'important');
            return;
        }
        followDrawer?.style.setProperty('transform', value, 'important');
        return;
    }
    if (followDrawer === null)
        return;
    const tx = followTranslate(strokeClosedTx, dx, strokeRtl, lockDrawerOpen);
    if (tx === null) {
        // Pulled back past the origin. Hold the drawer at rest instead of
        // releasing the inline pair: releasing would restore the host's .28s
        // transition mid-stroke, so a direction wobble would animate the drawer
        // and then jump when the finger crosses back — the same reason the open
        // branch pins instead of releasing.
        followEngaged = true;
        followDrawer.style.setProperty('transition', 'none', 'important');
        followDrawer.style.setProperty('transform', 'translateX(0px)', 'important');
        return;
    }
    followEngaged = true;
    followDrawer.style.setProperty('transition', 'none', 'important');
    followDrawer.style.setProperty('transform', `translateX(${tx}px)`, 'important');
}
/**
 * Drop the inline follow styles. The host stylesheet retakes control: with
 * the transition restored, clearing the transform animates the drawer from
 * the finger position to whatever the CURRENT host state says. Called on
 * every end-stroke branch (revert: this IS the spring-back; commit: the
 * same-task retarget below overrides the initial leg before any paint).
 */
function releaseFollowStyles() {
    const el = followDrawer;
    if (!followEngaged || el === null)
        return;
    followEngaged = false;
    el.style.removeProperty('transition');
    el.style.removeProperty('transform');
}
/** A close commit that is still animating to the closed slot before the host
 * state flips. The flip MUST wait: the sidebar column renders two mutually
 * exclusive subtrees (280px drawer when open, 206px nav rail when closed),
 * and React swaps them some ~200ms after the marker flips — measured
 * mid-animation at t≈200ms of a 280ms transition (width 280→206, tx jumped
 * -207.6→-181.9 as -110% re-resolved against the narrower rail). Flipping
 * first therefore replaces the drawer's content and retargets its transition
 * IN FLIGHT — user report 「最后抽屉样式突然消失,不是自然的动画收起」.
 * Late commit: animate the inline transform to the slot, flip only when the
 * drawer is already off-screen, then drop the inline pair. */
let pendingCommit = null;
function finishPendingCommit() {
    const pending = pendingCommit;
    if (pending === null)
        return;
    pendingCommit = null;
    window.clearTimeout(pending.timer);
    // The element may already be unmounted (React swaps the subtree at the
    // flip); stripping inline from a detached node is a harmless no-op.
    pending.el.style.removeProperty('transition');
    pending.el.style.removeProperty('transform');
    // If the host already closed while our animation ran (e.g. a genuine
    // backdrop tap inside the 280ms window), the flip already happened and a
    // blind toggle would RE-OPEN the drawer — skip it.
    const frame = (0, phone_chrome_ts_1.getFrame)();
    if (frame !== null && !frame.hasAttribute('data-sidebar-collapsed')) {
        pending.ctx.layout.toggleSidebar();
    }
}
/** Animate `el` to `targetTx` with our own transition, flip the host when it
 * lands. One-shot: a second call settles the previous commit first. */
function commitWithAnimation(ctx, el, targetTx) {
    finishPendingCommit();
    el.style.setProperty('transition', `transform ${COMMIT_ANIM_MS}ms ease-in-out`, 'important');
    // Flush the before-change style so the transition provably starts from the
    // current (finger) position instead of risking a coalesced recalc that
    // would jump straight to the target.
    void el.getBoundingClientRect();
    el.style.setProperty('transform', targetTx, 'important');
    // Fade the dimming in step with the slide-out: the marker flips only when
    // the drawer lands, so without this the screen would go drawer-then-dark
    // (backdrop snapping away ~260ms AFTER the drawer already left).
    (0, overlay_backdrop_fab_ts_1.fadeOverlayOut)();
    cooldownUntil = performance.now() + COOLDOWN_MS;
    pendingCommit = {
        el,
        ctx,
        timer: window.setTimeout(finishPendingCommit, COMMIT_ANIM_MS + 40),
    };
}
/** Terminal close commit: animate the drawer into the closed slot, then flip
 * the host. The slot must be the host's REAL closed rule (-110%), because
 * after the flip the closed host paints exactly this value — dropping the
 * inline pair must be a no-op, not a jump. */
function commitFollowClose(ctx) {
    const el = followDrawer;
    followDrawer = null;
    followEngaged = false;
    if (el === null) {
        // No follow binding (defensive): fall back to the immediate flip.
        releaseFollowStyles();
        ctx.layout.toggleSidebar();
        cooldownUntil = performance.now() + COOLDOWN_MS;
        return;
    }
    const target = strokeRtl
        ? `translateX(${CLOSED_SLOT_PCT}%)`
        : `translateX(-${CLOSED_SLOT_PCT}%)`;
    commitWithAnimation(ctx, el, target);
}
/** Cancel paths: styles back to the host, pointer state to idle. An armed
 * open follow has already flipped the host state, so a cancel must also
 * toggle it back — release the inline pair first so the host transition
 * animates home from the finger position within the same task. */
function abortStroke(ctx, immediate = false) {
    if (pendingCommit !== null) {
        // A terminal commit is animating: this stroke already ended. Only a
        // teardown (dispose) must settle it synchronously; otherwise let the
        // timer land the flip.
        if (immediate)
            finishPendingCommit();
        return;
    }
    const wasArmed = openFollowArmed;
    openFollowArmed = false;
    openFollowRefused = false;
    revealDrawerContent();
    if (wasArmed && ctx !== null && followDrawer !== null && !immediate) {
        // Armed open stroke aborted mid-follow: the host is already open, and
        // flipping now would swap the subtree mid-motion — same artifact as the
        // close release. Animate back into the slot, then flip.
        reset();
        commitFollowClose(ctx);
        return;
    }
    releaseFollowStyles();
    reset();
    if (wasArmed && ctx !== null) {
        ctx.layout.toggleSidebar();
        cooldownUntil = performance.now() + COOLDOWN_MS;
    }
}
/** Start a stroke; returns true when it may be tracked. */
function beginStroke(event, rtl, viewportWidthPx) {
    if (onCooldown())
        return false;
    if (modalOpen())
        return false;
    if (takeoverActive())
        return false;
    if (!(event.target instanceof Element))
        return false;
    // A stroke beginning inside a genuinely horizontally scrollable container
    // belongs to that scroller (the stats line, a message code block, any
    // carousel): yield it so its native horizontal pan survives — and so the
    // wide 45%-of-viewport start zone cannot turn a strip scroll into a
    // drawer open (failure scenario C1). Applies to both branches: inside the
    // drawer the same "scroller owns horizontal" semantics should hold.
    if (findHorizontalScroller(chainFrom(event.target)) !== null)
        return false;
    const open = drawerOpen();
    if (open) {
        // Close strokes may start ANYWHERE over the frame (2026-08-29 sixth
        // round, user report 「希望打开抽屉之后以外的部分可以进行左滑」). The
        // previous gate required the start point inside the drawer's own
        // geometry and explicitly rejected the backdrop, so the ~28% of the
        // screen beside the drawer swallowed every swipe — combined with the
        // leftward verdict being refused, closing felt impossible. Nothing else
        // owns a horizontal stroke while the drawer is open (the conversation is
        // behind the backdrop), so the whole frame is fair game.
        //
        // Tap-to-close on the backdrop is unaffected: a tap never reaches
        // tryLock, so endStroke returns on !wasTracking without writing a
        // consume mark, and the document-capture click handler passes backdrop /
        // FAB clicks through unconditionally anyway.
        const frame = (0, phone_chrome_ts_1.getFrame)();
        if (frame === null)
            return false;
        const rect = frame.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right)
            return false;
        if (event.clientY < rect.top || event.clientY > rect.bottom)
            return false;
        // A session-row action menu (kebab) owns its own tap.
        if (event.target.closest('[class*="sessionRow"] button') !== null)
            return false;
    }
    else if (!hitTestStart(event.clientX, viewportWidthPx, rtl, { startZonePx: startZonePxFor(viewportWidthPx) })) {
        return false;
    }
    trackingPointer = event.pointerId;
    tracking = false;
    startX = event.clientX;
    startY = event.clientY;
    samples = [{ t: event.timeStamp, x: event.clientX }];
    return true;
}
/**
 * Axis-lock the stroke once its dominant axis has moved LOCK_PX. Horizontal
 * dominance (|dx| > |dy|) locks to X and is tracked; vertical dominance
 * abandons the stroke back to native scrolling (browser takes over, no
 * further preventDefault). Once locked the axis never re-decides — matching
 * MUI's UNCERTAINTY_THRESHOLD semantics.
 */
function tryLock(event) {
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < LOCK_PX)
        return false;
    if (Math.abs(dx) <= Math.abs(dy)) {
        // Vertical-dominant: hand the touch back to scrolling.
        reset();
        return false;
    }
    tracking = true;
    lockDrawerOpen = drawerOpen();
    // Publish the lock to the host handlers (see gesture-guard.ts): they run
    // EARLIER in this release event's capture phase, before endStroke writes
    // any consume mark — the flag is their only ordering-proof yield signal
    // (audit S0/S1).
    (0, gesture_guard_ts_1.markStrokeLocked)();
    startFollow();
    return true;
}
/** Append a sample and prune the window. */
function pushSample(event) {
    samples.push({ t: event.timeStamp, x: event.clientX });
    const cutoff = event.timeStamp - VELOCITY_WINDOW_MS;
    let i = 0;
    while (i < samples.length - 1 && samples[i].t < cutoff)
        i += 1;
    if (i > 0)
        samples = samples.slice(i);
}
/**
 * Release the stroke: classify, then either commit or spring back.
 *
 * B 档 ordering is load-bearing: the verdict is computed FIRST (the follow
 * position IS dx, so classifySwipe decides complete-vs-revert exactly as in
 * A 档), then the inline follow styles are dropped — restoring the host
 * transition and clearing the transform starts an animation toward the
 * drawer's CURRENT host state — and only then does the commit flip the host
 * state, retargeting that transition within the SAME task. No paint happens
 * between the two, so the user sees one continuous motion from the finger
 * position into the final state; a reverted stroke simply animates home.
 *
 * An ARMED OPEN follow inverts the commit: the host state was already
 * flipped at arm time, so a positive verdict must NOT toggle again (that
 * would close the drawer the user just pulled out) and a negative verdict
 * must toggle BACK. Either way the inline release comes first, so the host
 * transition animates from the finger position to whichever state wins.
 */
function endStroke(ctx, event, rtl, viewportWidthPx) {
    const wasTracking = tracking;
    const armedOpen = openFollowArmed;
    openFollowArmed = false;
    openFollowRefused = false;
    // Velocity must be computed before reset() clears the samples.
    const vel = slidingVelocity(samples, VELOCITY_WINDOW_MS, event.timeStamp);
    // Distance is measured from the stroke START (not the axis-lock point):
    // the slop is an activation gate, not travel that should consume the
    // user's swipe distance. Measuring from the lock point made the effective
    // travel = slop + threshold (e.g. 4px + 78px), so a 78px threshold
    // actually needed ~82px+ of finger travel — the "feels like half the
    // screen" complaint. From the start, a 78px threshold is a 78px swipe.
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    reset();
    if (!wasTracking) {
        // A stroke that armed the follow is by definition locked, so this branch
        // cannot leave the host state flipped — but keep the invariant explicit.
        if (armedOpen) {
            commitFollowClose(ctx);
        }
        return;
    }
    const modal = modalOpen();
    // An armed open follow has already flipped the marker, so classifySwipe
    // must still be asked the question the USER answered: it was a closed
    // drawer when the stroke began (lockDrawerOpen), which is what the stored
    // flag holds — never re-read drawerOpen() here.
    const verdict = modal || (!armedOpen && onCooldown())
        ? 'none'
        : classifySwipe({
            openDistanceRatio: OPEN_DISTANCE_RATIO,
            closeDistanceRatio: CLOSE_DISTANCE_RATIO,
            velocityWindowMs: VELOCITY_WINDOW_MS,
            openVelocity: OPEN_VELOCITY,
            closeVelocity: CLOSE_VELOCITY,
            lockPx: LOCK_PX,
            cooldownMs: COOLDOWN_MS,
            startZonePx: startZonePxFor(viewportWidthPx),
            viewportWidthPx,
            drawerOpen: lockDrawerOpen,
        }, { dx, dy, velX: vel }, rtl);
    // The mount-frame split must never survive into a terminal state: reveal
    // the contents (no-op unless armed this stroke) before any release or
    // commit animation.
    revealDrawerContent();
    // Terminal styles, per verdict. CLOSE commits are LATE: animate the inline
    // transform into the closed slot and flip the host only when the drawer is
    // already off-screen (commitFollowClose → commitWithAnimation) — flipping
    // first swaps the sidebar subtree mid-animation (measured: width 280→206
    // at t≈200ms of the 280ms transition, tx jumped backward). OPEN verdicts
    // and the revert/modal/cooldown paths keep the plain release: the host
    // stays in its current state, so its own transition finishes the motion
    // and no subtree swap can be in flight. Every path either releases or
    // hands the inline pair to the pending commit — it can never leak.
    if (armedOpen) {
        // The host is already open (early commit). Keep it on 'open', otherwise
        // animate back into the slot and flip closed.
        if (verdict === 'open') {
            releaseFollowStyles();
            cooldownUntil = performance.now() + COOLDOWN_MS;
        }
        else {
            commitFollowClose(ctx);
        }
        if (event.target instanceof Element)
            markStrokeConsumed(event.target);
        return;
    }
    if (!(event.target instanceof Element))
        return;
    if (verdict === 'close') {
        // Mark the stroke consumed so the tap's synthetic click cannot
        // double-toggle or navigate a row. The mark walks the ancestor chain up
        // to the DRAWER (not the frame): the synthetic click always lands on the
        // stroke's own start target (left-edge start zone / drawer content), never
        // on the backdrop — but the backdrop is a frame child, so marking up to
        // the frame would make the host treat a genuine backdrop tap within the
        // 300ms window as consumed and swallow the close (the "tap twice to close"
        // bug). Marking stays IMMEDIATE even though the flip is late: the mark
        // snapshots the chain now, and the synthetic click arrives within ~10ms.
        markStrokeConsumed(event.target);
        commitFollowClose(ctx);
        return;
    }
    releaseFollowStyles();
    if (verdict === 'open') {
        // Unreachable for a tracked stroke (an unarmed stroke is by definition
        // drawer-open at start), but keep the host-service commit symmetric.
        markStrokeConsumed(event.target);
        ctx.layout.toggleSidebar();
        cooldownUntil = performance.now() + COOLDOWN_MS;
    }
}
/**
 * Mark the released stroke so its synthetic click cannot re-toggle the drawer
 * or activate a row.
 *
 * The mark walks the ancestor chain up to the DRAWER when the stroke started
 * inside it: the backdrop is a frame child, so stopping at the frame would
 * make the host treat a genuine backdrop tap within the window as consumed
 * and swallow the close (the "tap twice to close" bug). A stroke that started
 * OUTSIDE the drawer (the left-edge start zone, or — since closing accepts
 * the whole frame — the backdrop itself) has no drawer in its chain, so the
 * walk would otherwise run all the way to the document root and briefly
 * shadow every tap on the page; the frame is the tightest correct stop for
 * those, and it is what must be marked anyway, because a backdrop-started
 * close stroke needs its own overlay click consumed.
 */
function markStrokeConsumed(target) {
    const drawer = findDrawer();
    const upTo = drawer !== null && drawer.contains(target) ? drawer : (0, phone_chrome_ts_1.getFrame)() ?? null;
    (0, gesture_guard_ts_1.markGestureConsumed)(target, CONSUME_WINDOW_MS, upTo);
    consumedEl = target;
}
/** Forget stroke state (called on cancel / visibility change / blur). */
function reset() {
    trackingPointer = 0;
    tracking = false;
    samples = [];
    (0, gesture_guard_ts_1.clearStrokeLocked)();
}
/** The logical reading direction of the frame (RTL support). */
function frameRtl() {
    const frame = (0, phone_chrome_ts_1.getFrame)();
    return frame !== null && getComputedStyle(frame).direction === 'rtl';
}
/** Install the gesture layer for the current mobile breakpoint. */
function installSidebarSwipe(ctx) {
    (0, phone_chrome_ts_1.installMobileEffect)(ctx, 'dsh-mobile-nav: sidebar swipe gestures', () => {
        const viewportWidth = () => window.innerWidth || document.documentElement.clientWidth || 0;
        const onPointerDown = (event) => {
            // A new pointer starts a new interaction epoch: drop the previous
            // stroke's click gate. When the browser never delivers the synthetic
            // click (iOS shells suppress it after a swipe), this — together with
            // the short CONSUME_WINDOW_MS — keeps the next genuine tap alive
            // instead of eating it at the document-capture click handler.
            consumedEl = null;
            (0, gesture_guard_ts_1.clearStrokeLocked)(); // belt-and-suspenders: a lost stroke must not leak its lock into this epoch
            if (event.pointerType !== 'touch' && event.pointerType !== 'pen')
                return;
            if (trackingPointer !== 0 && trackingPointer !== event.pointerId)
                return;
            beginStroke(event, frameRtl(), viewportWidth());
        };
        const onPointerMove = (event) => {
            if (event.pointerId !== trackingPointer)
                return;
            // A modal may rise mid-stroke (e.g. an a11y trap opening) — spec review
            // 缺陷 1's guard, now per-MOVE because B 档 paints a transform the
            // modal must not inherit: abandon and spring the drawer back.
            if (modalOpen() || takeoverActive()) {
                abortStroke(ctx);
                return;
            }
            if (!tracking) {
                if (tryLock(event)) {
                    pushSample(event);
                    applyFollow(ctx, event.clientX - startX);
                }
            }
            else {
                pushSample(event);
                applyFollow(ctx, event.clientX - startX);
            }
        };
        const onPointerUp = (event) => {
            if (event.pointerId !== trackingPointer)
                return;
            endStroke(ctx, event, frameRtl(), viewportWidth());
        };
        const onPointerCancel = (event) => {
            if (event.pointerId !== trackingPointer)
                return;
            abortStroke(ctx);
        };
        // The browser may synthesize a click a few ms after the stroke's
        // pointerup. The host overlay handlers and the FAB / backdrop element
        // listeners would treat it as a tap; swallow it at document capture so
        // a swipe can never toggle twice or navigate a row. Non-gesture taps
        // (no live mark) pass through untouched.
        //
        // A click whose target is (or is inside) the backdrop or the FAB is
        // NEVER a gesture's synthetic click: the stroke start is always the
        // left-edge start zone or the drawer content, never the backdrop (outside
        // the drawer, on the right) or the FAB. The mark chain can reach them
        // in degenerate hit-test cases (e.g. a stroke starting on a point where
        // the empty drawer does not register as the event target), and
        // swallowing that click would break the "tap the backdrop to close"
        // path — the "tap twice to close" bug. Let those clicks through.
        const onClick = (event) => {
            if (consumedEl === null)
                return;
            if (!(event.target instanceof Element))
                return;
            // A genuine backdrop / FAB tap is always let through: their own click
            // listeners toggle the drawer, and a consume mark that walked to the
            // document root would otherwise swallow it ("tap twice to close").
            // The one exception is a click on the overlay element that STARTED the
            // just-committed stroke — since close strokes may begin anywhere over
            // the frame, the backdrop can now be the stroke's own start target,
            // and letting its synthetic click through would re-toggle the drawer
            // straight back open.
            const overlay = event.target.closest('[data-mobile-nav="backdrop"], [data-mobile-nav="fab"]');
            if (overlay !== null && !overlay.contains(consumedEl))
                return;
            if (!(0, gesture_guard_ts_1.consumeIfGestured)(event))
                return;
            event.stopPropagation();
            event.preventDefault();
            consumedEl = null;
        };
        const onVisibility = () => {
            if (document.hidden)
                abortStroke(ctx);
        };
        // Edge-touch priority (iOS UIScreenEdgePanGestureRecognizer semantics):
        // a stroke that began inside the left-edge start zone must never be
        // claimed by native scrolling. touch-action: pan-y already forbids the
        // browser from panning it horizontally; this preventDefault (passive:
        // false) additionally stops the vertical-scroll claim, so the pointer
        // event stream reaches the gesture layer intact on browsers where the
        // scroller wins the race (iOS Safari in particular — headless cannot
        // reproduce that behavior). Vertical-dominant strokes abandon the
        // gesture (reset() clears trackingPointer), so scrolling resumes for
        // touches that were never swipes. Strokes starting inside a genuinely
        // horizontally scrollable container never reach this state at all
        // (beginStroke rejects them via findHorizontalScroller), so their
        // native horizontal pan is never prevented.
        const onTouchMove = (event) => {
            if (trackingPointer !== 0)
                event.preventDefault();
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('pointermove', onPointerMove, true);
        document.addEventListener('pointerup', onPointerUp, true);
        document.addEventListener('pointercancel', onPointerCancel, true);
        document.addEventListener('click', onClick, true);
        document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
        const onBlur = () => abortStroke(ctx);
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('blur', onBlur);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown, true);
            document.removeEventListener('pointermove', onPointerMove, true);
            document.removeEventListener('pointerup', onPointerUp, true);
            document.removeEventListener('pointercancel', onPointerCancel, true);
            document.removeEventListener('click', onClick, true);
            document.removeEventListener('touchmove', onTouchMove, { capture: true });
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('blur', onBlur);
            abortStroke(ctx, true);
        };
    });
}
};
__modules["effects/preset-menu-fix.js"] = function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.installHeroPresetMenuFix = installHeroPresetMenuFix;
const phone_chrome_ts_1 = require("./effects/phone-chrome.js");
const MARGIN = 12;
function getSafeTop() {
    // env(safe-area-inset-top) is the notch / status-bar height. Fixed menus
    // at top:12 would render under the notch on iOS. Read the real inset via
    // a probe element so the clamp below pushes the menu below the notch.
    try {
        const probe = document.createElement('div');
        probe.style.position = 'fixed';
        probe.style.top = '0';
        probe.style.paddingTop = 'env(safe-area-inset-top, 0px)';
        probe.style.visibility = 'hidden';
        probe.style.pointerEvents = 'none';
        document.body.appendChild(probe);
        const v = parseFloat(getComputedStyle(probe).paddingTop) || 0;
        probe.remove();
        return v;
    }
    catch {
        return 0;
    }
}
function isPortalMenu(el) {
    if (!(el instanceof HTMLElement))
        return false;
    if (el.getAttribute('role') !== 'menu')
        return false;
    const cs = getComputedStyle(el);
    // Host Menu portal is position:fixed; non-portal is absolute inside a relative wrapper
    return cs.position === 'fixed';
}
function fixPortalMenus() {
    const safeTop = getSafeTop();
    const margin = MARGIN + safeTop;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const menus = document.querySelectorAll('div[role="menu"]');
    for (const menu of menus) {
        if (!isPortalMenu(menu))
            continue;
        // Only hero preset / workspace pickers are long — but clamp is safe for all portal menus
        const rect = menu.getBoundingClientRect();
        // Height may be 0 during hidden pre-render (visibility:hidden top:0) — skip then
        if (rect.height === 0 && menu.offsetHeight === 0)
            continue;
        const h = menu.offsetHeight || rect.height;
        const w = menu.offsetWidth || rect.width;
        let top = rect.top;
        let left = rect.left;
        let needs = false;
        // Correct the inverted clamp bug in Menu.tsx: Math.min(Math.max(y,MARGIN),vh-lh-MARGIN)
        // yields negative y when lh > vh-MARGIN. The host code measured lh from
        // calc(100vh) while vh is innerHeight (dynamic). Push back into the viewport.
        if (top < margin) {
            top = margin;
            needs = true;
        }
        if (h > 0 && top + h > vh - MARGIN) {
            // Prefer keeping the menu at the corrected top and let its internal
            // viewport scroll. If it still overflows, clamp top to fit.
            if (top + h > vh - MARGIN) {
                const clamped = Math.max(margin, vh - h - MARGIN);
                if (clamped < top) {
                    top = clamped;
                    needs = true;
                }
            }
        }
        if (w > 0) {
            if (left < MARGIN) {
                left = MARGIN;
                needs = true;
            }
            if (left + w > vw - MARGIN) {
                const clampedX = Math.max(MARGIN, vw - w - MARGIN);
                if (clampedX < left) {
                    left = clampedX;
                    needs = true;
                }
            }
        }
        if (needs) {
            menu.style.top = `${Math.round(top)}px`;
            menu.style.left = `${Math.round(left)}px`;
            // Ensure the menu never exceeds the dynamic viewport — dvh fallback
            // covers the CSS 100vh mismatch on mobile Safari.
            const maxH = vh - margin - MARGIN;
            if (h > maxH) {
                menu.style.maxHeight = `calc(100dvh - ${margin + MARGIN}px)`;
                // Fallback for engines without dvh
                if (getComputedStyle(menu).maxHeight === 'none' || menu.style.maxHeight.includes('dvh')) {
                    // Keep the dvh value; CSS fallback below covers 100vh
                }
            }
        }
    }
}
/**
 * Fix the new-session hero preset dropdown on mobile: when the preset list
 * is long, the host Menu's clamp uses `Math.min(Math.max(y,MARGIN),vh-lh-MARGIN)`
 * which inverts when lh (100vh-24) > innerHeight-MARGIN and produces a negative
 * top, so the top presets are clipped above the viewport. On narrow viewports
 * this effect post-corrects any portal menu's fixed position back into the
 * 12px + safe-area margin and caps its max-height to the dynamic viewport.
 */
function installHeroPresetMenuFix(ctx) {
    (0, phone_chrome_ts_1.installMobileEffect)(ctx, 'dsh-maestro-mobile: hero preset menu viewport fix', () => {
        let raf = 0;
        const schedule = () => {
            if (raf !== 0)
                return;
            raf = requestAnimationFrame(() => {
                raf = 0;
                fixPortalMenus();
            });
        };
        const mo = new MutationObserver(schedule);
        mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
        window.addEventListener('scroll', schedule, true);
        window.addEventListener('resize', schedule);
        // Also watch size changes of any open menu
        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
        const attachRo = () => {
            if (ro === null)
                return;
            document.querySelectorAll('div[role="menu"]').forEach(el => {
                try {
                    ro.observe(el);
                }
                catch { }
            });
        };
        attachRo();
        const roMo = new MutationObserver(attachRo);
        roMo.observe(document.body, { childList: true, subtree: true });
        // Run once on install in case a menu is already open (probe)
        schedule();
        return () => {
            if (raf !== 0)
                cancelAnimationFrame(raf);
            mo.disconnect();
            roMo.disconnect();
            ro?.disconnect();
            window.removeEventListener('scroll', schedule, true);
            window.removeEventListener('resize', schedule);
        };
    });
}
};
__modules["i18n/locales.js"] = function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.en = exports.zh = exports.NS = void 0;
/** `mobileNav` namespace dictionaries: drawer controls. */
exports.NS = 'mobileNav';
/** Primary dictionary (the key-set source of truth). */
exports.zh = {
    'open': 'Open directory',
    'close': 'Close directory',
    'backdrop': 'Click to close directory',
    'sessionLog': 'Session log',
    'files': 'Files',
    'previewFullscreen': 'Fullscreen preview',
    'previewExitFullscreen': 'Exit fullscreen',
};
/** English dictionary, key-identical to the primary source. */
exports.en = {
    'open': 'Open directory',
    'close': 'Close directory',
    'backdrop': 'Click to close directory',
    'sessionLog': 'Session log',
    'files': 'Files',
    'previewFullscreen': 'Fullscreen preview',
    'previewExitFullscreen': 'Exit fullscreen',
};
};
__modules["index.js"] = function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inject = void 0;
exports.apply = apply;
const MobileNavToggle_tsx_1 = require("./components/MobileNavToggle.js");
const MobileDrawerFooter_tsx_1 = require("./components/MobileDrawerFooter.js");
const ShellOverlay_tsx_1 = require("./components/ShellOverlay.js");
const index_ts_1 = require("./styles/index.js");
const phone_chrome_ts_1 = require("./effects/phone-chrome.js");
const subagent_chip_touch_ts_1 = require("./effects/subagent-chip-touch.js");
const aionui_compat_ts_1 = require("./effects/aionui-compat.js");
const layout_bridge_ts_1 = require("./effects/layout-bridge.js");
const viewport_ts_1 = require("./effects/viewport.js");
const sidebar_swipe_ts_1 = require("./effects/sidebar-swipe.js");
const preset_menu_fix_ts_1 = require("./effects/preset-menu-fix.js");
const locales_ts_1 = require("./i18n/locales.js");
/** Required services (cordis fiber inject — the loader passes all module exports as an object plugin). */
exports.inject = ['slots', 'layout', 'locale', 'sessionLogDownload'];
/**
 * Mobile-adaptive shell, browser half: injects the mobile stylesheet, then
 * contributes the directory toggle to the session header and the backdrop +
 * floating button to the shell overlay.
 * @param ctx - client root context.
 */
function apply(ctx) {
    ctx.effect(() => ctx.locale.register(locales_ts_1.NS, { zh: locales_ts_1.zh, en: locales_ts_1.en }), 'dsh-maestro-mobile: dictionaries');
    ctx.effect(() => {
        const tag = document.createElement('style');
        tag.dataset.plugin = '@ddtcorex/dsh-maestro-mobile';
        tag.dataset.pluginCss = '@ddtcorex/dsh-maestro-mobile/mobile.css';
        tag.textContent = index_ts_1.MOBILE_CSS;
        document.head.appendChild(tag);
        // Keep this stylesheet last in <head> so its overrides win over the
        // host UI's own styles (some host rules also use !important).
        setTimeout(() => {
            if (tag.isConnected)
                document.head.appendChild(tag);
        }, 0);
        return () => {
            tag.remove();
        };
    }, 'dsh-maestro-mobile: styles');
    // Hard-fix the installed-plugins list text layout: the host market UI
    // injects its own CSS after this plugin's stylesheet, so CSS overrides can
    // be beaten. Inline !important styles win over every external rule. Keep
    // the selector on outer rows only; irowActions/irowTrailing are nested
    // flex containers and must retain the market's own action geometry.
    ctx.effect(() => {
        const mq = window.matchMedia('(max-width: 1023px)');
        const rowSelector = '[class*="irow"]:not([class*="irowActions"]):not([class*="irowTrailing"])';
        const set = (el, props) => {
            for (const [key, value] of Object.entries(props)) {
                el.style.setProperty(key, value, 'important');
            }
        };
        const unset = (el, props) => {
            for (const key of props)
                el.style.removeProperty(key);
        };
        const rowProps = ['flex-wrap', 'align-items', 'gap'];
        const firstProps = ['flex', 'max-width', 'min-width'];
        const textProps = ['white-space', 'overflow', 'text-overflow', 'max-width'];
        const clear = () => {
            document.querySelectorAll(rowSelector).forEach((row) => {
                unset(row, rowProps);
                const first = row.children[0];
                if (first)
                    unset(first, firstProps);
                row.querySelectorAll(':scope > button, :scope > [class*="owner"], :scope > [class*="grow"]').forEach((el) => {
                    unset(el, ['order']);
                });
                const spec = row.querySelector('[class*="spec"]');
                const nm = row.querySelector('[class*="nm"]');
                if (spec)
                    unset(spec, textProps);
                if (nm)
                    unset(nm, textProps);
            });
        };
        const apply = () => {
            document.querySelectorAll(rowSelector).forEach((row) => {
                set(row, {
                    'flex-wrap': 'wrap',
                    'align-items': 'center',
                    'gap': '4px 10px',
                });
                const first = row.children[0];
                if (first) {
                    set(first, {
                        'flex': '1 1 100%',
                        'max-width': '100%',
                        'min-width': '0',
                    });
                }
                const spec = row.querySelector('[class*="spec"]');
                const nm = row.querySelector('[class*="nm"]');
                if (spec) {
                    set(spec, {
                        'white-space': 'nowrap',
                        'overflow': 'hidden',
                        'text-overflow': 'ellipsis',
                        'max-width': '100%',
                    });
                }
                if (nm) {
                    set(nm, {
                        'white-space': 'nowrap',
                        'overflow': 'hidden',
                        'text-overflow': 'ellipsis',
                        'max-width': '100%',
                    });
                }
            });
        };
        const arm = () => {
            clear();
            if (mq.matches)
                apply();
        };
        arm();
        const mo = new MutationObserver(() => {
            if (mq.matches)
                apply();
        });
        mo.observe(document.documentElement, { childList: true, subtree: true });
        mq.addEventListener('change', arm);
        return () => {
            mo.disconnect();
            mq.removeEventListener('change', arm);
            clear();
        };
    }, 'dsh-maestro-mobile: installed-list-inline-styles');
    // Shared mobile infrastructure: frame marker ownership and the single
    // full-tree reconciler. Installed inside one effect so a plugin reload in
    // the same JS environment tears the whole reconciler down and rebuilds it.
    ctx.effect(() => {
        const stops = [
            (0, phone_chrome_ts_1.installFrameController)(),
            (0, phone_chrome_ts_1.installReconciler)(ctx),
            (0, phone_chrome_ts_1.registerReconcileTasks)(ctx),
        ];
        return () => {
            for (const stop of stops)
                stop();
        };
    }, 'dsh-maestro-mobile: reconciler infrastructure');
    // Drawer close interactions: Escape and navigation taps inside the drawer.
    (0, phone_chrome_ts_1.installOverlayInteractions)(ctx);
    // Sidebar drawer swipe gestures (edge swipe-in / content swipe-out with B-hybrid follow)
    (0, sidebar_swipe_ts_1.installSidebarSwipe)(ctx);
    // DSH-native bridges (reuse AppFrame breakpoint + ThemePresenter)
    (0, layout_bridge_ts_1.installLayoutBridge)(ctx);
    (0, viewport_ts_1.installViewportBridge)(ctx);
    // Lineage-count chip: reliable open/close on touch pointers (upstream is
    // hover-timer driven and has no onClick on the count variant).
    (0, subagent_chip_touch_ts_1.installSubagentChipTouch)(ctx);
    (0, phone_chrome_ts_1.installPhoneChrome)(ctx);
    (0, aionui_compat_ts_1.installAionuiCompat)(ctx);
    // New-session hero preset list on mobile: long lists previously clipped the
    // top presets above the viewport due to the host Menu's inverted clamp
    // (100vh-measured height vs innerHeight). Post-correct fixed portal menus
    // on narrow viewports and cap height to dvh.
    (0, preset_menu_fix_ts_1.installHeroPresetMenuFix)(ctx);
    // DSH-native overlay: backdrop + FAB via AppFrame's overlayLayer (z20)
    // Replaces manual frame.appendChild in overlay-backdrop-fab.ts — keeps
    // the legacy task as compat until the next major, but the slot is the
    // source of truth for backdrop/FAB now.
    ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'mobile-shell-overlay',
        locale: locales_ts_1.NS,
        inject: () => ({
            toggleSidebar: () => ctx.layout.toggleSidebar(),
        }),
    }, ShellOverlay_tsx_1.ShellOverlay));
    ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
        name: 'conversation.session.header.actions',
        id: 'mobile-nav-toggle',
        order: 10,
        locale: locales_ts_1.NS,
        inject: () => ({
            toggleSidebar: () => ctx.layout.toggleSidebar(),
        }),
    }, MobileNavToggle_tsx_1.MobileNavToggle));
    // Session log download, relocated from the session header to the drawer
    // footer on mobile (the header capsule is hidden by CSS); the drawer
    // footer also hosts the Files action that opens the dsh-web-ui explorer
    // sheet.
    //
    // Footer stacking relies on the list-slot sort by (priority, order):
    // dsh-remote-web-ui leaves it unset (default 0, its two icon buttons stay
    // on top) and dsh-usage-stats uses 10. Order 5 keeps the Files + Session
    // log pills directly under the icon row with the usage/balance badge
    // below them — instead of a tie at 10 where registration order could
    // wedge the badge between the icons and the pills.
    ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action',
        id: 'mobile-nav-session-log',
        order: 5,
        locale: locales_ts_1.NS,
        inject: () => ({
            downloadSessionLog: (sessionId) => ctx.sessionLogDownload.download(sessionId),
            toggleSidebar: () => ctx.layout.toggleSidebar(),
        }),
    }, MobileDrawerFooter_tsx_1.MobileDrawerFooter));
}
};
var __cache = {};
function __localRequire(id) {
  if (id.charCodeAt(0) !== 46) return require(id);
  id = id.slice(2);
  var cached = __cache[id];
  if (cached) return cached.exports;
  var module = { exports: {} };
  __cache[id] = module;
  __modules[id](__localRequire, module, module.exports);
  return module.exports;
}
var module = { exports: {} };
__modules["index.js"](__localRequire, module, module.exports);
return module.exports; } });

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
exports.createStatsLineTask = createStatsLineTask;
// The official conversation status row (turns / steps / LLM time / TTFT /
// cache) has a hashed class, so the stylesheet cannot target it directly.
// Mark the exact row on narrow screens by text: a [class*=_root] that
// carries the metrics text and no textarea (the composer card also ends in
// _root and can mention turns in its model line). The CSS then lays the
// marked row out as ONE horizontally scrolling line with every metric
// reachable.
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
        for (const root of document.querySelectorAll('[data-phase] [class*="_root"]')) {
            // The status row lives inside the composer stack; message-area
            // blocks can also mention turns/steps and must be skipped.
            if (root.closest('[class*="_composerStack"]') === null)
                continue;
            // The todo plan strip also lives in the composer stack and its root
            // ends in _root. Its items may legitimately contain "steps" in
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
exports.createOverlayTask = createOverlayTask;
exports.createRightPanelBackdropTask = createRightPanelBackdropTask;
const phone_chrome_ts_1 = require("./effects/phone-chrome.js");
function createOverlayTask(t, toggleSidebar) {
    let backdrop = null;
    let fab = null;
    const drawerOpen = () => {
        const frame = (0, phone_chrome_ts_1.getFrame)();
        return frame !== null && !frame.hasAttribute('data-sidebar-collapsed');
    };
    const heroPhase = () => document.querySelector('[data-phase="active"]') === null;
    return {
        name: 'overlay-backdrop-fab',
        scopes: ['*', 'data-sidebar-collapsed', 'data-phase'],
        ensure: () => {
            const frame = (0, phone_chrome_ts_1.getFrame)();
            if (frame === null)
                return;
            if (drawerOpen() && backdrop === null) {
                backdrop = document.createElement('div');
                backdrop.dataset.mobileNav = 'backdrop';
                backdrop.setAttribute('role', 'button');
                backdrop.setAttribute('aria-label', t('backdrop'));
                backdrop.addEventListener('click', toggleSidebar);
                frame.appendChild(backdrop);
            }
            else if (!drawerOpen() && backdrop !== null) {
                backdrop.remove();
                backdrop = null;
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
            backdrop?.remove();
            backdrop = null;
            fab?.remove();
            fab = null;
        },
    };
}
/**
 * Fix for dsh-better-sidebar — right-panel backdrop task on mobile.
 * Creates a tappable dimmed layer inside [data-dsh-panel-host] (z-index 39)
 * below the panel (z 40) so chat is not silently hidden behind the 92vw
 * drawer. Host has pointer-events:none, so backdrop must re-enable it.
 */
function createRightPanelBackdropTask(t) {
    let backdrop = null;
    const isRightPanelOpen = () => {
        const panel = document.querySelector('[data-dsh-panel]');
        if (panel === null)
            return false;
        // Fix for dsh-better-sidebar: hash is nArs4W_panelHidden — use substring so rebuilds don't break detection
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
                // Fix for dsh-better-sidebar: add the hashed hidden class via the existing hidden marker — use className string to avoid hash dependency
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
                // Insert before the panel so it sits below panel (z-index) but above center
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
            // A touch row-tap owns the close (pointerup or the navigation observer);
            // let the row's click reach React without toggling the drawer twice.
            if (performance.now() - lastTouchNavAt < 500)
                return;
            if (shouldCloseOnTapInsideDrawer(event.target))
                closeDrawerAndPanel();
        };
        const onDrawerPointerUp = (event) => {
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
        // Yield the preview sheet first (compat.css gives preview precedence
        // over explorer), then open the explorer and close the drawer.
        (0, phone_chrome_ts_1.getFrame)()?.removeAttribute('data-aionui-preview-open');
        (0, phone_chrome_ts_1.getFrame)()?.setAttribute('data-aionui-explorer-open', '');
        toggleSidebar();
    };
    return ((0, jsx_runtime_1.jsxs)("div", { "data-mobile-nav": "drawer-actions", children: [(0, jsx_runtime_1.jsxs)("button", { type: "button", "data-mobile-nav": "explorer", "aria-label": t('files'), title: t('files'), onClick: openExplorer, children: [(0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconPanelLeftOutline16, { size: 14 }), (0, jsx_runtime_1.jsx)("span", { children: t('files') })] }), (0, jsx_runtime_1.jsxs)("button", { type: "button", "data-mobile-nav": "session-log", "aria-label": t('sessionLog'), title: t('sessionLog'), disabled: sessionId === undefined, onClick: () => {
                    if (sessionId !== undefined)
                        downloadSessionLog(sessionId);
                }, children: [(0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconDownloadOutline16, { size: 14 }), (0, jsx_runtime_1.jsx)("span", { children: t('sessionLog') })] })] }));
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
     The system status bar stays visible (no fullscreen). Two adjustments
     make it behave:
     - touch-action: manipulation kills double-tap-to-zoom (and the 300ms
       tap delay) while keeping pan and pinch zoom; the client also
       suppresses legacy-iOS gesturestart as a fallback.
     - With the client's viewport-fit=cover, env(safe-area-inset-top) is the
       status bar / notch height; the rules below push the app content below
       it so the status bar never covers anything. Off notched phones (or in
       a normal browser tab where the layout viewport already sits below the
       status bar) the inset is 0 and nothing shifts. */
  html,
  body {
    touch-action: manipulation !important;
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
     against the 36px secondary pills (13/500). */
  [data-mobile-nav="frame"] [class*="_settingsArea"] button:not([aria-modal="true"] *) {
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
  [data-mobile-nav="frame"] [class*="_settingsArea"] button:not([aria-modal="true"] *):hover {
    background: var(--dsw-alias-button-floating-hover, rgba(0,0,0,.06)) !important;
  }
  [data-mobile-nav="frame"] [class*="_settingsArea"] button:not([aria-modal="true"] *) svg {
    width: 16px !important;
    height: 16px !important;
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
    gap: 8px !important;
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
    // DSH-native bridges (reuse AppFrame breakpoint + ThemePresenter)
    (0, layout_bridge_ts_1.installLayoutBridge)(ctx);
    (0, viewport_ts_1.installViewportBridge)(ctx);
    // Lineage-count chip: reliable open/close on touch pointers (upstream is
    // hover-timer driven and has no onClick on the count variant).
    (0, subagent_chip_touch_ts_1.installSubagentChipTouch)(ctx);
    (0, phone_chrome_ts_1.installPhoneChrome)(ctx);
    (0, aionui_compat_ts_1.installAionuiCompat)(ctx);
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

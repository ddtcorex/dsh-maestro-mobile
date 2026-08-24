/** `mobileNav` namespace dictionaries: drawer controls. */
export declare const NS = "mobileNav";
/** Primary dictionary (the key-set source of truth). */
export declare const zh: {
    readonly open: "Open directory";
    readonly close: "Close directory";
    readonly backdrop: "Click to close directory";
    readonly sessionLog: "Session log";
    readonly files: "Files";
    readonly previewFullscreen: "Fullscreen preview";
    readonly previewExitFullscreen: "Exit fullscreen";
};
/** English dictionary, key-identical to the primary source. */
export declare const en: Record<MobileNavKey, string>;
/** Key domain of the `mobileNav` namespace (primary dictionary is the source of truth). */
export type MobileNavKey = keyof typeof zh;
//# sourceMappingURL=locales.d.ts.map
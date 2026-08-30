export interface BottomSheetProps {
    open: boolean;
    onClose: () => void;
    title: string;
    closeLabel: string;
    children?: React.ReactNode;
}
/**
 * DSH-native bottom sheet: reuses Modal's mask + dialog tokens
 * (--dsw-alias-bg-mask-1, --dsw-mask-blur, --dsw-alias-bg-layer-2, --dsw-shadow-lv3)
 * but positions as a bottom sheet on mobile via CSS.
 * Desktop falls back to centered dialog (no-op via media query).
 * @param props - sheet props.
 * @returns portal or null.
 */
export declare function BottomSheet({ open, onClose, title, closeLabel, children }: BottomSheetProps): import("react").ReactPortal | null;
//# sourceMappingURL=BottomSheet.d.ts.map
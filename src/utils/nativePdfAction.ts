type PdfAction = (blob: Blob, fileName: string) => void | Promise<void>;

type NativePdfActions = {
  preview: PdfAction;
  download: PdfAction;
};

let nativePdfActions: NativePdfActions | undefined;

/** Registered only by the separately bundled native entry point. */
export function registerNativePdfActions(actions: NativePdfActions) {
  nativePdfActions = actions;
}

export function getNativePdfAction(action: keyof NativePdfActions) {
  return nativePdfActions?.[action];
}

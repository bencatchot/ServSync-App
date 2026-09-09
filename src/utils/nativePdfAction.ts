type NativePdfAction = (blob: Blob, fileName: string) => void;
let nativePdfAction: NativePdfAction | undefined;

/** Registered only by the separately bundled native entry point. */
export function registerNativePdfAction(action: NativePdfAction) {
  nativePdfAction = action;
}

export function handleNativePdf(blob: Blob, fileName: string) {
  if (!nativePdfAction) return false;
  nativePdfAction(blob, fileName);
  return true;
}

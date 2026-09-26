function currentModal() {
  const focused = document.activeElement;
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>(
    'dialog[open], [role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]',
  )).filter(dialog => !dialog.closest('[hidden], [aria-hidden="true"], [inert]')
    && dialog.getClientRects().length > 0
    && getComputedStyle(dialog).visibility === 'visible');
  // A browser top-layer dialog is above CSS overlays regardless of DOM order.
  const nativeModals = dialogs.filter(dialog => dialog.matches('dialog:modal')).reverse();
  const nativeModal = nativeModals.find(dialog => dialog.contains(focused)) ?? nativeModals[0];
  const candidates = (nativeModal
    ? dialogs.filter(dialog => dialog === nativeModal || nativeModal.contains(dialog))
    : dialogs).reverse();
  return candidates.find(dialog => dialog.contains(focused)) ?? candidates[0];
}

/** Android Back belongs to the current modal before browser navigation. */
export function handleNativeBack(canGoBack: boolean, minimizeApp: () => void | Promise<void>) {
  const dialog = currentModal();
  if (dialog instanceof HTMLDialogElement) {
    const event = new Event('cancel', { cancelable: true });
    if (dialog.dispatchEvent(event) && dialog.open) dialog.close();
  } else if (dialog) {
    // Reuse the component's Escape handler so its busy/cancel/focus rules stay
    // authoritative. A modal that ignores Escape still consumes Android Back.
    if (dialog.getAttribute('aria-busy') === 'true') return;
    const focused = document.activeElement;
    const target = focused && dialog.contains(focused) ? focused : dialog;
    target.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', code: 'Escape', bubbles: true, cancelable: true,
    }));
  } else if (canGoBack) window.history.back();
  else void minimizeApp();
}

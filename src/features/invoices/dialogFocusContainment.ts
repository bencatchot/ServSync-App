export function containDialogTabFocus(event: KeyboardEvent, dialog: HTMLElement | null) {
  if (event.key !== 'Tab' || !dialog) return;

  const focusableSelector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');
  const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter(element => (
    element.getAttribute('aria-disabled') !== 'true'
    && !element.hidden
    && element.getClientRects().length > 0
  ));

  if (focusable.length === 0) {
    event.preventDefault();
    dialog.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (focusable.length === 1) {
    event.preventDefault();
    first.focus();
    return;
  }

  if (event.shiftKey && (active === first || !dialog.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

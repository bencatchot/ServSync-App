/** Keep the native shell within the visible viewport and reveal focused fields after IME resize. */
export function installNativeViewport() {
  const root = document.documentElement;
  let frame = 0;
  const position = () => {
    const viewport = window.visualViewport;
    if (!viewport || viewport.scale === 1) {
      root.style.setProperty('--native-viewport-top', `${viewport?.offsetTop ?? 0}px`);
    }
  };
  const update = () => {
    const viewport = window.visualViewport;
    if (viewport && viewport.scale !== 1) return;
    position();
    root.style.setProperty('--native-viewport-height', `${viewport?.height ?? window.innerHeight}px`);
    const focused = document.activeElement;
    const editing = focused instanceof HTMLElement && focused.matches('input:not([type="checkbox"]):not([type="radio"]):not([type="file"]), textarea, [contenteditable="true"]');
    root.classList.toggle('native-editing', editing);
    cancelAnimationFrame(frame);
    if (editing) frame = requestAnimationFrame(() => focused.scrollIntoView({ block: 'center', inline: 'nearest' }));
  };
  const onFocusOut = () => { queueMicrotask(update); };
  update();
  window.visualViewport?.addEventListener('resize', update);
  window.visualViewport?.addEventListener('scroll', position);
  window.addEventListener('resize', update);
  document.addEventListener('focusin', update);
  document.addEventListener('focusout', onFocusOut);
  return () => {
    cancelAnimationFrame(frame);
    window.visualViewport?.removeEventListener('resize', update);
    window.visualViewport?.removeEventListener('scroll', position);
    window.removeEventListener('resize', update);
    document.removeEventListener('focusin', update);
    document.removeEventListener('focusout', onFocusOut);
  };
}

import { handleNativePdf } from "./nativePdfAction";

let closeActivePreview: (() => void) | undefined;

/** Same-page native dialog avoids popup blockers and owns its temporary URL. */
export function showPdfPreview(blob: Blob, fileName = 'ServSync-document.pdf') {
  if (handleNativePdf(blob, fileName)) return;
  closeActivePreview?.();
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const url = URL.createObjectURL(blob);
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-label', 'PDF preview');
  dialog.style.cssText = 'width:min(1100px,96vw);height:92dvh;max-height:96dvh;padding:0;border:1px solid #cbd5e1;border-radius:16px;background:white;color:#0f172a;';
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px;flex-wrap:wrap;border-bottom:1px solid #cbd5e1';
  const title = document.createElement('strong'); title.textContent = 'PDF preview'; title.style.flex = '1';
  const download = document.createElement('a');
  download.href = url; download.download = fileName; download.textContent = 'Download PDF';
  download.style.cssText = 'padding:12px;color:#1d4ed8;font-weight:600;';
  const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Close';
  close.setAttribute('aria-label', 'Close PDF preview');
  close.style.cssText = 'padding:12px;border:1px solid #cbd5e1;border-radius:8px;background:white;color:#0f172a;cursor:pointer;';
  const hint = document.createElement('p');
  hint.textContent = 'If your browser cannot display this PDF, use Download PDF.';
  hint.style.cssText = 'margin:8px 12px;font-size:13px;color:#475569;';
  const frame = document.createElement('iframe'); frame.src = url; frame.title = 'ServSync PDF document';
  frame.style.cssText = 'display:block;width:100%;height:calc(100% - 110px);border:0;';
  header.append(title, download, close); dialog.append(header, hint, frame);
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true; dialog.remove(); URL.revokeObjectURL(url);
    window.removeEventListener('pagehide', cleanup);
    if (closeActivePreview === cleanup) closeActivePreview = undefined;
    if (previousFocus?.isConnected) previousFocus.focus();
  };
  closeActivePreview = cleanup;
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', cleanup, { once: true });
  window.addEventListener('pagehide', cleanup, { once: true });
  document.body.append(dialog);
  try { dialog.showModal(); close.focus(); } catch (error) { cleanup(); throw error; }
}

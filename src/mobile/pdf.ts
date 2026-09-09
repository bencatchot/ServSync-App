import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('Unable to prepare the PDF.'));
    reader.readAsDataURL(blob);
  });
}

/** Ask the user to open/save/share; never silently choose a recipient. */
export function showNativePdf(blob: Blob, fileName: string) {
  const previousFocus = document.activeElement as HTMLElement | null;
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-label', 'PDF document');
  dialog.style.cssText = 'width:min(420px,90vw);padding:20px;border:0;border-radius:16px;background:white;color:#0f172a';
  const title = document.createElement('h2'); title.textContent = fileName;
  title.style.cssText = 'font-weight:700;overflow-wrap:anywhere';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.textContent = 'Open the share sheet to save this PDF or choose an app to view it.';
  const share = document.createElement('button'); share.textContent = 'Open or share PDF';
  const close = document.createElement('button'); close.textContent = 'Close';
  for (const button of [share, close]) button.style.cssText = 'display:block;width:100%;min-height:48px;margin-top:12px;border:1px solid #cbd5e1;border-radius:8px';
  let active = false;
  const tempPath = `servsync-pdf/${crypto.randomUUID()}/${fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0,100) || 'document.pdf'}`;
  share.onclick = () => {
    if (active) return;
    active = true; share.disabled = true; close.disabled = true;
    status.textContent = 'Preparing PDF…';
    void (async () => {
      try {
        const { uri } = await Filesystem.writeFile({ path: tempPath, data: await base64(blob), directory: Directory.Cache, recursive: true });
        await Share.share({ title: fileName, files: [uri], dialogTitle: 'Open or share PDF' });
        status.textContent = 'The share sheet closed. You can open it again or return to ServSync.';
      } catch {
        status.textContent = 'Sharing was cancelled or unavailable. Your saved document is unchanged. You can try again.';
      } finally {
        active = false; share.disabled = false; close.disabled = false;
      }
    })();
  };
  close.onclick = () => dialog.close();
  dialog.addEventListener('cancel', event => { if (active) event.preventDefault(); });
  dialog.addEventListener('close', () => {
    dialog.remove();
    void Filesystem.deleteFile({ path: tempPath, directory: Directory.Cache }).catch(() => undefined);
    if (previousFocus?.isConnected) previousFocus.focus();
  }, { once: true });
  dialog.append(title, status, share, close); document.body.append(dialog);
  dialog.showModal(); share.focus();
}

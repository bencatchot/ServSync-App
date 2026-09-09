import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { registerNativePdfAction } from '../utils/nativePdfAction';
import { showNativePdf } from './pdf';

async function start() {
  if (Capacitor.isNativePlatform()) {
    registerNativePdfAction(showNativePdf);
    const label = document.createElement('div');
    label.textContent = 'ServSync Demo · Test accounts only';
    label.style.cssText = 'text-align:center;background:#223d67;color:white;font:12px system-ui;padding:5px';
    document.body.prepend(label);
    const connection = document.createElement('div');
    connection.setAttribute('role', 'status');
    connection.style.cssText = 'position:fixed;bottom:90px;left:12px;right:12px;z-index:1000;background:#92400e;color:white;border-radius:8px;padding:12px;font:14px system-ui';
    document.body.append(connection);
    const updateConnection = ({ connected }: { connected: boolean }) => {
      connection.hidden = connected;
      connection.textContent = connected ? '' : 'No connection. Changes cannot be saved. Reconnect before continuing.';
    };
    // Subscribe before reading so reconnects remain observable.
    await Network.addListener('networkStatusChange', updateConnection);
    updateConnection(await Network.getStatus());
    if (Capacitor.getPlatform() === 'android') {
      await App.addListener('backButton', ({ canGoBack }) => {
        const dialog = document.querySelector<HTMLDialogElement>('dialog[open]');
        if (dialog) {
          const event = new Event('cancel', { cancelable: true });
          if (dialog.dispatchEvent(event)) dialog.close();
        } else if (canGoBack) window.history.back();
        else void App.minimizeApp();
      });
    }
  }
  if (!window.location.hash) window.location.hash = '/contractor';
  await import('../main');
}

void start().catch(() => {
  const message = document.createElement('p');
  message.textContent = 'ServSync could not start. Close and reopen the app to try again.';
  document.getElementById('root')?.replaceChildren(message);
});

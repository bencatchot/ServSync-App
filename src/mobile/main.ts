import './native.css';
import { installNativeViewport } from './viewport';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { registerNativePdfAction } from '../utils/nativePdfAction';
import { showNativePdf } from './pdf';

async function start() {
  if (Capacitor.isNativePlatform()) {
    document.documentElement.classList.add('servsync-native');
    installNativeViewport();
    registerNativePdfAction(showNativePdf);
    const label = document.createElement('div');
    label.textContent = 'ServSync Demo · Test accounts only';
    label.className = 'native-demo-label';
    document.body.prepend(label);
    const connection = document.createElement('div');
    connection.setAttribute('role', 'status');
    connection.className = 'native-connection-notice';
    document.getElementById('root')?.before(connection);
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

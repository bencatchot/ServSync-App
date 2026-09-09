import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.servsync.demo',
  appName: 'ServSync Demo',
  webDir: 'dist-mobile',
  ios: { path: 'mobile/ios', contentInset: 'always' },
  android: { path: 'mobile/android' },
  // Bundle the app locally. No remote-server URL, cleartext, or navigation wildcard.
};
export default config;

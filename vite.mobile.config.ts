import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
// @ts-expect-error Build-only JavaScript guard is covered by node tests.
import { assertMobileDemoEnvironment, DEMO_WEB_ORIGIN, mobileDemoWorkDefines } from './scripts/mobile/environment.mjs';

// @ts-expect-error Build-only JavaScript guard is covered by node tests.
import { readIosBetaDefines } from './scripts/mobile/ios-beta-environment.mjs';

export default defineConfig(({ mode }) => {
  const beta = mode === 'ios-internal-beta';
  const env = beta ? {} : { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
  if (!beta) assertMobileDemoEnvironment(env);
  return {
    root: 'mobile',
    envDir: beta ? false : '..',
    envPrefix: beta ? [] : 'VITE_',
    publicDir: '../public',
    plugins: [react()],
    define: beta ? readIosBetaDefines() : {
      ...mobileDemoWorkDefines(env),
      'import.meta.env.VITE_IOS_INTERNAL_BETA': JSON.stringify('false'),
      'import.meta.env.VITE_NATIVE_DEMO': JSON.stringify('true'),
      'import.meta.env.VITE_NATIVE_WEB_ORIGIN': JSON.stringify(DEMO_WEB_ORIGIN),
    },
    build: { outDir: beta ? '../mobile-build/ios-beta-web' : '../dist-mobile', emptyOutDir: true },
  };
});

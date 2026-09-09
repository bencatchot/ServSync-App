import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
// @ts-expect-error Build-only JavaScript guard is covered by node tests.
import { assertMobileDemoEnvironment, DEMO_WEB_ORIGIN, mobileDemoWorkDefines } from './scripts/mobile/environment.mjs';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
  assertMobileDemoEnvironment(env);
  return {
    root: 'mobile',
    envDir: '..',
    publicDir: '../public',
    plugins: [react()],
    define: {
      ...mobileDemoWorkDefines(env),
      'import.meta.env.VITE_NATIVE_DEMO': JSON.stringify('true'),
      'import.meta.env.VITE_NATIVE_WEB_ORIGIN': JSON.stringify(DEMO_WEB_ORIGIN),
    },
    build: { outDir: '../dist-mobile', emptyOutDir: true },
  };
});

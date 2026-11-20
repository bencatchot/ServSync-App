import { defineConfig, devices } from '@playwright/test';

const port = 48457;
export default defineConfig({
  testDir: '.',
  testMatch: 'portal-switch.spec.ts',
  use: { baseURL: 'http://127.0.0.1:' + port },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'iphone', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    cwd: '../..',
    command: 'npm run build -- --outDir dist-ssr/portal-qa && npm run preview -- --outDir dist-ssr/portal-qa --host 127.0.0.1 --strictPort --port ' + port,
    env: { VERCEL_ENV: 'preview', VERCEL_PROJECT_ID: 'prj_tB94FLcorqX9sW7EGPd7t32Z4rdS' },
    url: 'http://127.0.0.1:' + port + '/portal-switch-preview.html',
  },
});

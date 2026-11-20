import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Only the existing Demo project's Vercel Preview builds get the extra entry.
const portalSwitchPreview = process.env.VERCEL_ENV === 'preview'
  && process.env.VERCEL_PROJECT_ID === 'prj_tB94FLcorqX9sW7EGPd7t32Z4rdS';

export default defineConfig({
  plugins: [react()],
  define: { __PORTAL_SWITCH_PREVIEW__: JSON.stringify(portalSwitchPreview) },
  build: portalSwitchPreview ? {
    rolldownOptions: { input: ['index.html', 'portal-switch-preview.html'] },
  } : undefined,
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});

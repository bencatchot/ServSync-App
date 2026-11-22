import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // A standalone, fictional review entry. No route or dependency in the shipping app.
  build: process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_GIT_COMMIT_REF === 'codex/private-job-expenses-v1'
    ? { rollupOptions: { input: ['index.html', 'job-expenses-preview.html'] } }
    : undefined,
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});

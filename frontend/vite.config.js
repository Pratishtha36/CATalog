import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { offlinePlugin } from './offlinePlugin';

export default defineConfig(({ command, mode }) => {
  if (command === 'build' && process.env.VERCEL) {
    const env = loadEnv(mode, process.cwd(), 'VITE_');
    const value = (process.env.VITE_API_URL || env.VITE_API_URL || '').trim();
    let url;
    try { url = new URL(value); } catch { /* Give the actionable error below. */ }
    if (!url || url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
      throw new Error('Set VITE_API_URL in Vercel to the HTTPS Render origin, e.g. https://YOUR-SERVICE.onrender.com (without /api), then redeploy.');
    }
  }
  return {
    plugins: [react(), tailwindcss(), offlinePlugin()],
    server: { proxy: { '/api': 'http://127.0.0.1:8000' } },
  };
});

import { defineConfig, loadEnv } from 'vite';

// The service's .env lives one folder up; read PORT from it so the dev proxy
// follows whatever port the API runs on.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '');
  const apiPort = Number(env.PORT) || 8090;

  return {
    server: {
      port: 5173,
      proxy: {
        '/api': { target: `http://localhost:${apiPort}`, changeOrigin: true }
      }
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      chunkSizeWarningLimit: 900
    }
  };
});

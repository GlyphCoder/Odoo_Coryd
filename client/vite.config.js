import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev proxy: forward API + websocket to the Express server on :4000.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:4000', ws: true, changeOrigin: true },
    },
  },
});

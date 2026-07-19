import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev proxy: forward API + websocket to the Express server on :4000.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,          // bind to 0.0.0.0 — reachable from other devices / tunnels
    allowedHosts: true,
    proxy: {
      // 127.0.0.1 (not localhost) avoids IPv6 ::1 resolution missing the server.
      '/api': { target: 'http://127.0.0.1:4000', changeOrigin: true },
      '/socket.io': { target: 'http://127.0.0.1:4000', ws: true, changeOrigin: true },
    },
  },
});
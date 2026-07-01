import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['buffer', 'process', 'stream', 'util', 'crypto'],
      globals: { Buffer: true, process: true },
    }),
  ],
  define: {
    global: 'globalThis',
  },
  server: {
    port: 5173,
    host: true,
  },
});

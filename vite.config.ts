import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 8000,
    open: true,
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          'three': ['three'],
          'peerjs': ['peerjs'],
          'tone': ['tone'],
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ['three'], // Don't pre-bundle Three.js during dev
  },
});

import { defineConfig } from 'vite';

export default defineConfig({
  // Capacitor serves the build from the app's local origin, so asset URLs must be relative.
  base: './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    target: 'es2020',
  },
});

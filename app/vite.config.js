// Enchanted, built on Meta's Immersive Web SDK (IWSDK). `npm run dev` for a local server, `npm run publish-site`
// to build and copy the finished site to the repository root (where GitHub Pages serves it).
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  publicDir: 'public',
  server: { host: '0.0.0.0', port: 8081 },
  build: { outDir: 'dist', assetsDir: 'build', target: 'esnext', sourcemap: false, chunkSizeWarningLimit: 4000 },
  esbuild: { target: 'esnext' },
  // the game's code was written against three.js's "three/addons/..." paths
  resolve: { alias: [{ find: /^three\/addons\//, replacement: 'three/examples/jsm/' }], dedupe: ['three'] },
  optimizeDeps: { exclude: ['@babylonjs/havok'], esbuildOptions: { target: 'esnext' } },
});

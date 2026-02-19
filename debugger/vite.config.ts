import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import fs from 'fs';

function serveLibpgQueryWasm() {
  const wasmPath = path.resolve(
    __dirname,
    'node_modules/libpg-query/wasm/libpg-query.wasm'
  );
  return {
    name: 'serve-libpg-query-wasm',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.endsWith('libpg-query.wasm')) {
          res.setHeader('Content-Type', 'application/wasm');
          fs.createReadStream(wasmPath).pipe(res);
          return;
        }
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.endsWith('libpg-query.wasm')) {
          res.setHeader('Content-Type', 'application/wasm');
          fs.createReadStream(wasmPath).pipe(res);
          return;
        }
        next();
      });
    },
    closeBundle() {
      const outDir = path.resolve(__dirname, 'dist/assets');
      const dest = path.join(outDir, 'libpg-query.wasm');
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(outDir, { recursive: true });
        fs.copyFileSync(wasmPath, dest);
      }
    },
  };
}

export default defineConfig({
  base: '/postgres-sqlite-parsing/',
  plugins: [
    serveLibpgQueryWasm(),
    react(),
    wasm(),
    topLevelAwait(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@poc/json-schema': path.resolve(__dirname, '../poc-json-schema/src'),
      '@poc/deparser': path.resolve(__dirname, '../poc-deparser/src'),
    },
    dedupe: ['pgsql-parser', 'pgsql-deparser', 'libpg-query'],
  },
  optimizeDeps: {
    include: ['pgsql-parser', 'pgsql-deparser', 'libpg-query'],
  },
});

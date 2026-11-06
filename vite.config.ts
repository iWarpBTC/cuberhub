import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The database starts workers and loads SQLite as WebAssembly, both by paths next to its own files,
  // which only hold while Vite serves those files as they are instead of prebundling them.
  optimizeDeps: { exclude: ['@evolu/web', '@evolu/sqlite-wasm'] },
});

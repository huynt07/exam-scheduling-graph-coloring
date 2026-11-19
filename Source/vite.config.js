import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Build ra một file index.html duy nhất (gộp JS, CSS) để người dùng bấm đúp mở bằng Chrome/Edge.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { outDir: '../Release', emptyOutDir: false },
  test: { environment: 'node', include: ['tests/**/*.test.js'] },
});

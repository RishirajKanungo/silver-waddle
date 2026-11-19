import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// KaTeX ships woff2 + woff + ttf for every face. Browsers only need woff2; dropping the
// other two keeps the single-file build small (fonts are inlined as data URIs).
const katexWoff2Only = (): Plugin => ({
  name: 'katex-woff2-only',
  enforce: 'pre',
  transform(code, id) {
    if (!/katex(\.min)?\.css$/.test(id)) return null;
    return code.replace(/,\s*url\([^)]*\.woff\)\s*format\("woff"\)/g, '').replace(/,\s*url\([^)]*\.ttf\)\s*format\("truetype"\)/g, '');
  },
});

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [katexWoff2Only(), react(), viteSingleFile()] : [katexWoff2Only(), react()],
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist', chunkSizeWarningLimit: 6000, assetsInlineLimit: mode === 'single' ? 100_000_000 : 4096 },
  test: { include: ['src/**/*.test.ts'], testTimeout: 120000 },
}));

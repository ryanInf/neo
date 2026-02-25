import { defineConfig, Plugin } from 'vite';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const extensionRoot = path.resolve(process.cwd(), 'extension');
const sourceRoot = path.resolve(extensionRoot, 'src');

function copyExtensionAssets(): Plugin {
  const assets = [
    { from: path.resolve(sourceRoot, 'manifest.json'), to: 'manifest.json' },
    { from: path.resolve(sourceRoot, 'popup/index.html'), to: 'popup.html' },
    { from: path.resolve(sourceRoot, 'popup/popup.css'), to: 'popup.css' },
  ];

  return {
    name: 'neo-copy-extension-assets',
    apply: 'build' as const,
    generateBundle() {
      for (const asset of assets) {
        if (!existsSync(asset.from)) continue;
        this.emitFile({
          type: 'asset',
          fileName: asset.to,
          source: readFileSync(asset.from),
        });
      }
    },
  };
}

// Each entry is built as a separate IIFE to avoid ES module imports
// (Chrome extension content scripts don't support ES modules)
const entry = process.env.NEO_ENTRY || 'all';

const entries: Record<string, { input: string; format: 'iife' | 'es' }> = {
  background: { input: path.resolve(sourceRoot, 'background/index.ts'), format: 'es' },
  content: { input: path.resolve(sourceRoot, 'content/index.ts'), format: 'iife' },
  inject: { input: path.resolve(sourceRoot, 'inject/interceptor.ts'), format: 'iife' },
  popup: { input: path.resolve(sourceRoot, 'popup/popup.ts'), format: 'iife' },
};

const buildEntry = entries[entry];

export default defineConfig({
  build: {
    outDir: path.resolve(extensionRoot, 'dist'),
    emptyOutDir: entry === 'all' || entry === 'background', // only clear on first build
    sourcemap: false,
    rollupOptions: buildEntry
      ? {
          input: buildEntry.input,
          output: {
            entryFileNames: `${entry}.js`,
            format: buildEntry.format,
            inlineDynamicImports: true,
          },
        }
      : {
          // Fallback: build all as ES modules (for 'all' mode)
          input: Object.fromEntries(
            Object.entries(entries).map(([k, v]) => [k, v.input])
          ),
          output: {
            entryFileNames: '[name].js',
            chunkFileNames: '[name]-[hash].js',
            assetFileNames: '[name][extname]',
          },
        },
  },
  plugins: [
    ...(entry === 'all' || entry === 'background' ? [copyExtensionAssets()] : []),
  ],
});

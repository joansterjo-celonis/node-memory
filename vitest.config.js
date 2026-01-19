import { defineConfig } from 'vitest/config';
import { transform } from 'esbuild';

const jsxInJs = () => ({
  name: 'jsx-in-js',
  enforce: 'pre',
  async transform(code, id) {
    if (!id.includes('/src/') || !id.endsWith('.js')) return null;
    const result = await transform(code, {
      loader: 'jsx',
      jsx: 'automatic',
      sourcefile: id
    });
    return { code: result.code, map: result.map };
  }
});

export default defineConfig({
  plugins: [jsxInJs()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    include: [
      'tests/unit/**/*.{test,spec}.{js,jsx}',
      'tests/integration/**/*.{test,spec}.{js,jsx}'
    ],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    pool: 'threads',
    maxWorkers: 1
  },
  esbuild: {
    jsx: 'automatic',
    loader: 'jsx'
  }
});

import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { FileSystemIconLoader } from 'unplugin-icons/loaders';
import Icons from 'unplugin-icons/vite';
import { defineConfig } from 'vite';
import devtoolsJson from 'vite-plugin-devtools-json';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
import { resolve } from 'path';

/**
 * HMR creates state inconsistencies, so we always reload the page.
 * @type {import('vite').PluginOption} PluginOption
 */
const alwaysFullReload = {
  name: 'always-full-reload',
  handleHotUpdate({ server }) {
    server.ws.send({ type: 'full-reload' });
    return [];
  }
};

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit(),
    Icons({
      compiler: 'svelte',
      customCollections: {
        custom: FileSystemIconLoader('./static/icons')
      }
    }),
    alwaysFullReload,
    devtoolsJson()
  ],
  envPrefix: 'MERMAID_',
  server: { port: 3000, host: true },
  preview: { port: 3000, host: true },
  resolve: {
    alias: [
      { find: 'load-tsconfig', replacement: resolve(__dirname, 'src/lib/shims/load-tsconfig.ts') },
      { find: 'bundle-require', replacement: resolve(__dirname, 'src/lib/shims/bundle-require.ts') },
      { find: /^fs\/promises$/, replacement: resolve(__dirname, 'src/lib/shims/node/fs-promises.ts') },
      { find: /^node:fs\/promises$/, replacement: resolve(__dirname, 'src/lib/shims/node/fs-promises.ts') },
      { find: /^fs$/, replacement: resolve(__dirname, 'src/lib/shims/node/fs.ts') },
      { find: /^node:fs$/, replacement: resolve(__dirname, 'src/lib/shims/node/fs.ts') },
      { find: /^path$/, replacement: resolve(__dirname, 'src/lib/shims/path-browserify.js') },
      { find: /^node:path$/, replacement: resolve(__dirname, 'src/lib/shims/path-browserify.js') },
      { find: /^os$/, replacement: resolve(__dirname, 'src/lib/shims/node/os.ts') },
      { find: /^node:os$/, replacement: resolve(__dirname, 'src/lib/shims/node/os.ts') },
      { find: /^url$/, replacement: resolve(__dirname, 'src/lib/shims/node/url.ts') },
      { find: /^node:url$/, replacement: resolve(__dirname, 'src/lib/shims/node/url.ts') },
      { find: /^util$/, replacement: resolve(__dirname, 'src/lib/shims/node/util.ts') },
      { find: /^node:util$/, replacement: resolve(__dirname, 'src/lib/shims/node/util.ts') },
      { find: /^module$/, replacement: resolve(__dirname, 'src/lib/shims/node/module.ts') },
      { find: /^http$/, replacement: resolve(__dirname, 'src/lib/shims/node/http.ts') },
      { find: /^node:http$/, replacement: resolve(__dirname, 'src/lib/shims/node/http.ts') },
      { find: /^http2$/, replacement: resolve(__dirname, 'src/lib/shims/node/http2.ts') },
      { find: /^node:http2$/, replacement: resolve(__dirname, 'src/lib/shims/node/http2.ts') },
      { find: /^stream$/, replacement: resolve(__dirname, 'src/lib/shims/node/stream.ts') },
      { find: /^node:stream$/, replacement: resolve(__dirname, 'src/lib/shims/node/stream.ts') },
      { find: /^node:stream\/promises$/, replacement: resolve(__dirname, 'src/lib/shims/node/stream-promises.ts') },
      { find: /^net$/, replacement: resolve(__dirname, 'src/lib/shims/node/net.ts') },
      { find: /^node:net$/, replacement: resolve(__dirname, 'src/lib/shims/node/net.ts') },
      { find: /^crypto$/, replacement: resolve(__dirname, 'src/lib/shims/node/crypto.ts') },
      { find: /^node:crypto$/, replacement: resolve(__dirname, 'src/lib/shims/node/crypto.ts') },
      { find: /^child_process$/, replacement: resolve(__dirname, 'src/lib/shims/node/child_process.ts') },
      { find: /^node:child_process$/, replacement: resolve(__dirname, 'src/lib/shims/node/child_process.ts') },
      { find: /^tty$/, replacement: resolve(__dirname, 'src/lib/shims/node/tty.ts') },
      { find: /^node:tty$/, replacement: resolve(__dirname, 'src/lib/shims/node/tty.ts') },
      { find: /^process$/, replacement: resolve(__dirname, 'src/lib/shims/node/process.ts') },
      { find: /^node:process$/, replacement: resolve(__dirname, 'src/lib/shims/node/process.ts') },
      { find: /^node:buffer$/, replacement: resolve(__dirname, 'src/lib/shims/node/buffer.ts') },
      { find: /^node:events$/, replacement: resolve(__dirname, 'src/lib/shims/node/events.ts') },
      { find: /^node:readline\/promises$/, replacement: resolve(__dirname, 'src/lib/shims/node/readline-promises.ts') }
    ]
  },
  test: {
    environment: 'jsdom',
    // in-source testing
    includeSource: ['src/**/*.{js,ts,svelte}'],
    // Ignore E2E tests
    exclude: [
      'tests/**/*',
      '**/node_modules/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*'
    ],
    setupFiles: ['./src/tests/setup.ts'],
    coverage: {
      exclude: ['src/mocks', '.svelte-kit', 'src/**/*.test.ts'],
      reporter: ['text', 'json', 'html', 'lcov']
    }
  }
});

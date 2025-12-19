// Ensure a minimal process object exists in the browser for dependencies that expect it.
import { Buffer } from '$lib/shims/node/buffer';
import * as pathShim from '$lib/shims/node/path';

if (typeof globalThis.process === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  globalThis.process = {
    env: { PATH: '', PATHEXT: '' },
    platform: 'browser',
    cwd: () => '/',
    argv: [],
    nextTick: (fn: (...args: unknown[]) => void, ...args: unknown[]) =>
      queueMicrotask(() => fn(...args)),
    hrtime: () => [0, 0],
    kill: () => {},
    exit: () => {}
  };
}

if (typeof globalThis.Buffer === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  globalThis.Buffer = Buffer;
}

// Some dependencies still reference `global`; alias it to globalThis for browser.
if (typeof (globalThis as unknown as { global?: unknown }).global === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  globalThis.global = globalThis;
}

// Provide a basic path-like object for libraries that grab it off global.
if (typeof (globalThis as unknown as { path?: unknown }).path === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  globalThis.path = pathShim;
}

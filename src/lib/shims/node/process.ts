export const env = {};
export const cwd = () => '/';
export const argv = [];
export const nextTick = (fn: (...args: unknown[]) => void, ...args: unknown[]) =>
  Promise.resolve().then(() => fn(...args));
export const hrtime = () => [0, 0];
export default { env, cwd, argv, nextTick, hrtime };

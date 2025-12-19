export const readFileSync = () => '';
export const existsSync = () => false;
export const statSync = () => ({ isFile: () => false, isDirectory: () => false });
export const mkdirSync = () => {};
export const promises = {
  readFile: async () => '',
  readdir: async () => [],
  stat: async () => ({ isFile: () => false, isDirectory: () => false })
};
export const stat = () => ({ isFile: () => false, isDirectory: () => false });
export const watch = () => ({ close: () => {} });
export const unwatchFile = () => {};
export const watchFile = () => {};
export default { readFileSync, existsSync, statSync, stat, promises, watch, unwatchFile, watchFile, mkdirSync };

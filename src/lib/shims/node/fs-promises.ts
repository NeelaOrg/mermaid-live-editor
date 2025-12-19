export const readFile = async () => '';
export const readdir = async () => [];
export const stat = async () => ({ isFile: () => false, isDirectory: () => false });
export const lstat = stat;
export const realpath = async (p: string) => p;
export const open = async () => ({
  write: async () => {},
  close: async () => {}
});
export const writeFile = async () => {};
export const unlink = async () => {};
export default { readFile, readdir, stat, lstat, realpath, open, writeFile, unlink };

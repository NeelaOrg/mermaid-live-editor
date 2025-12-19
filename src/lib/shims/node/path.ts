const pathShim = {
  resolve: (...args: string[]) => args.join('/'),
  dirname: (p: string) => p,
  join: (...args: string[]) => args.join('/'),
  relative: (_from: string, to: string) => to,
  isAbsolute: (p: string) => p.startsWith('/'),
  sep: '/',
  extname: (p: string) => {
    const idx = p.lastIndexOf('.');
    return idx >= 0 ? p.slice(idx) : '';
  },
  basename: (p: string) => {
    const parts = p.split('/');
    return parts[parts.length - 1] || '';
  },
  normalize: (p: string) => p,
  delimiter: ':'
};

export const resolve = pathShim.resolve;
export const dirname = pathShim.dirname;
export const join = pathShim.join;
export const relative = pathShim.relative;
export const isAbsolute = pathShim.isAbsolute;
export const sep = pathShim.sep;
export const extname = pathShim.extname;
export const basename = pathShim.basename;
export const normalize = pathShim.normalize;
export const delimiter = pathShim.delimiter;
export const posix = { sep: pathShim.sep, delimiter: pathShim.delimiter };
export const win32 = { sep: '\\\\', delimiter: ';' };

export default { ...pathShim, posix, win32 };

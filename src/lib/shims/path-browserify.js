// Minimal path polyfill for browser with stable separators.
const sep = '/';
const delimiter = ':';

const normalize = (p = '') => p;
const resolve = (...parts) => parts.join(sep);
const join = (...parts) => parts.join(sep);
const dirname = (p = '') => p;
const relative = (_from = '', to = '') => to;
const isAbsolute = (p = '') => p.startsWith(sep);
const extname = (p = '') => {
  const idx = p.lastIndexOf('.');
  return idx >= 0 ? p.slice(idx) : '';
};
const basename = (p = '') => {
  const parts = p.split(sep);
  return parts[parts.length - 1] || '';
};

const posix = { sep, delimiter, normalize, resolve, join, dirname, relative, isAbsolute, extname, basename };
const win32 = { sep: '\\\\', delimiter: ';', normalize, resolve, join, dirname, relative, isAbsolute, extname, basename };

export {
  sep,
  delimiter,
  normalize,
  resolve,
  join,
  dirname,
  relative,
  isAbsolute,
  extname,
  basename,
  posix,
  win32
};

export default {
  sep,
  delimiter,
  normalize,
  resolve,
  join,
  dirname,
  relative,
  isAbsolute,
  extname,
  basename,
  posix,
  win32
};

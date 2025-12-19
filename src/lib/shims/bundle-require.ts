// Browser shim for bundle-require; functions here are no-ops to satisfy imports.
export const JS_EXT_RE = /\.(js|jsx|ts|tsx|mjs|cjs)$/i;

export const bundleRequire = async () => {
  throw new Error('bundle-require is not available in the browser bundle');
};

export const dynamicImport = async () => {
  throw new Error('dynamicImport is not available in the browser bundle');
};

export const externalPlugin = () => ({ name: 'bundle-require-external-shim', setup() {} });

export const injectFileScopePlugin = () => ({
  name: 'bundle-require-inject-shim',
  setup() {}
});

export const loadTsConfig = async () => null;

export const match = () => false;

export const tsconfigPathsToRegExp = () => [];

export const pathToFileURL = (p: string) => new URL('file://' + p);
export const fileURLToPath = (u: string | URL) =>
  typeof u === 'string' ? u.replace('file://', '') : u.pathname;
export default {};

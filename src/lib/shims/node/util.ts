export const promisify = (fn: (...args: any[]) => any) => (...args: any[]) =>
  new Promise((resolve, reject) => {
    try {
      resolve(fn(...args));
    } catch (err) {
      reject(err);
    }
  });
export const stripVTControlCharacters = (str: string) => str;
export default { promisify, stripVTControlCharacters };

export class Buffer extends Uint8Array {
  static from(value: string | ArrayBuffer | ArrayLike<number>): Buffer {
    if (typeof value === 'string') {
      const enc = new TextEncoder();
      return new Buffer(enc.encode(value));
    }
    return new Buffer(value as ArrayBuffer);
  }

  static allocUnsafe(size: number): Buffer {
    return new Buffer(size);
  }
}
export default { Buffer };

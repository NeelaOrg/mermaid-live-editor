export class EventEmitter {
  on() {
    return this;
  }
  once() {
    return this;
  }
  off() {
    return this;
  }
  emit() {
    return false;
  }
  addListener() {
    return this;
  }
  removeListener() {
    return this;
  }
}
export const once = async (emitter: EventEmitter, event: string) =>
  new Promise((resolve) => emitter.once(event, resolve));
export const on = () => {};
export const off = () => {};
export const emit = () => {};
export default { EventEmitter, once, on, off, emit };

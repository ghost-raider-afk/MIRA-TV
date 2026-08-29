const target = new EventTarget();

export function emit(name, detail = undefined) {
  target.dispatchEvent(new CustomEvent(name, { detail }));
}

export function on(name, listener, options = undefined) {
  const handler = (event) => listener(event.detail, event);
  target.addEventListener(name, handler, options);
  return () => target.removeEventListener(name, handler, options);
}

export const events = Object.freeze({ emit, on });

// Minimal screen-stack router. Screens are modules exposing
// { bg, render(params) -> html, mount?(el, params), actions?, onBack?(params), onScan?(code, params) }.

const registry = new Map();
const stack = [];
let current = null; // { name, params, el }

const root = () => document.getElementById('root');
const host = () => document.getElementById('screens');

export function register(name, screen) {
  registry.set(name, screen);
}

export function currentScreen() {
  return current ? { ...current, screen: registry.get(current.name) } : null;
}

function show(name, params = {}, anim = 'enter') {
  const screen = registry.get(name);
  if (!screen) throw new Error(`unknown screen: ${name}`);
  const el = document.createElement('section');
  el.className = `screen scr-${name}${anim ? ` ${anim}` : ''}`;
  el.innerHTML = screen.render(params);
  root().dataset.bg = typeof screen.bg === 'function' ? screen.bg(params) : screen.bg || 'screen';

  const prev = current?.el;
  host().appendChild(el);
  if (prev) prev.remove();
  current = { name, params, el };
  screen.mount?.(el, params);
  window.dispatchEvent(new CustomEvent('screenchange', { detail: { name, params } }));
}

export function go(name, params = {}) {
  stack.push({ name, params });
  show(name, params, 'enter');
}

export function replace(name, params = {}, anim = 'fade') {
  stack.pop();
  stack.push({ name, params });
  show(name, params, anim);
}

export function reset(name, params = {}, anim = 'fade') {
  stack.length = 0;
  stack.push({ name, params });
  show(name, params, anim);
}

/** Pops back to the closest entry with this screen name (or resets to it). */
export function backTo(name, params) {
  while (stack.length && stack[stack.length - 1].name !== name) stack.pop();
  if (!stack.length) stack.push({ name, params: params || {} });
  const top = stack[stack.length - 1];
  if (params) top.params = params;
  show(top.name, top.params, 'enter-back');
}

export function pop() {
  if (stack.length <= 1) return false;
  stack.pop();
  const top = stack[stack.length - 1];
  show(top.name, top.params, 'enter-back');
  return true;
}

/** Hardware / header back: lets the screen intercept first. */
export function back() {
  const s = current && registry.get(current.name);
  if (s?.onBack && s.onBack(current.params) === true) return true;
  return pop();
}

/** Re-renders the current screen in place, keeping scroll positions. */
export function rerender(patch) {
  if (!current) return;
  if (patch) Object.assign(current.params, patch);
  const screen = registry.get(current.name);
  const scrolls = [...current.el.querySelectorAll('.scroll')].map((s) => s.scrollTop);
  current.el.innerHTML = screen.render(current.params);
  [...current.el.querySelectorAll('.scroll')].forEach((s, i) => (s.scrollTop = scrolls[i] || 0));
  root().dataset.bg = typeof screen.bg === 'function' ? screen.bg(current.params) : screen.bg || 'screen';
  screen.mount?.(current.el, current.params, true);
}

/**
 * Minimal DOM mock — simulates Obsidian's HTMLElement extensions.
 * Used by tests that need to verify DOM-building code without jsdom.
 */

export interface MockEl {
  tag: string;
  cls?: string;
  text?: string;
  textContent?: string;
  attrs: Record<string, string>;
  style: Record<string, string> & { cssText?: string };
  children: MockEl[];
  listeners: Record<string, Function[]>;
  classList: { add: (cls: string) => void; items: string[] };
  dataset: Record<string, string>;
  _removed: boolean;
  // Obsidian-style helpers
  createDiv: (opts?: { cls?: string; text?: string; attr?: Record<string, string> }) => MockEl;
  createEl: (tag: string, opts?: { cls?: string; text?: string; attr?: Record<string, string> }) => MockEl;
  createSpan: (opts?: { cls?: string; text?: string }) => MockEl;
  empty: () => void;
  addEventListener: (ev: string, fn: Function) => void;
  setAttribute: (name: string, value: string) => void;
  addClass: (cls: string) => void;
  querySelector: (sel: string) => MockEl | null;
  querySelectorAll: (sel: string) => MockEl[];
  remove: () => void;
  scrollIntoView: (opts?: any) => void;
}

function addChild(parent: MockEl, tag: string, opts?: { cls?: string; text?: string; attr?: Record<string, string> }): MockEl {
  const child = createMockEl(tag);
  if (opts?.cls) { child.cls = opts.cls; child.classList.items.push(...opts.cls.split(" ")); }
  if (opts?.text) { child.text = opts.text; child.textContent = opts.text; }
  if (opts?.attr) {
    Object.assign(child.attrs, opts.attr);
    if (opts.attr.style) {
      child.style.cssText = opts.attr.style;
      for (const pair of opts.attr.style.split(";").filter(Boolean)) {
        const [k, v] = pair.split(":").map(s => s.trim());
        if (k && v) child.style[k] = v;
      }
    }
  }
  parent.children.push(child);
  return child;
}

export function createMockEl(tag = "div"): MockEl {
  const el: MockEl = {
    tag,
    attrs: {},
    style: { cssText: "" } as MockEl["style"],
    children: [],
    listeners: {},
    classList: { add: (c: string) => { el.classList.items.push(c); }, items: [] },
    dataset: {},
    _removed: false,
    createDiv(opts) { return addChild(el, "div", opts); },
    createEl(etag, opts) { return addChild(el, etag, opts); },
    createSpan(opts) { return addChild(el, "span", opts); },
    empty() { el.children = []; },
    addEventListener(ev, fn) { (el.listeners[ev] ??= []).push(fn); },
    setAttribute(name, value) { el.attrs[name] = value; },
    addClass(c) { el.classList.items.push(c); },
    querySelector(sel) { return findEl(el, sel); },
    querySelectorAll(sel) { return findAllEl(el, sel); },
    remove() { el._removed = true; },
    scrollIntoView() { /* no-op in mock */ },
  };
  return el;
}

function matchesSel(el: MockEl, sel: string): boolean {
  if (sel.startsWith(".")) return el.classList.items.includes(sel.slice(1)) || el.cls === sel.slice(1);
  return el.tag === sel;
}

export function findEl(el: MockEl, sel: string): MockEl | null {
  if (matchesSel(el, sel)) return el;
  for (const c of el.children) {
    const found = findEl(c, sel);
    if (found) return found;
  }
  return null;
}

export function findAllEl(el: MockEl, sel: string): MockEl[] {
  const results: MockEl[] = [];
  if (matchesSel(el, sel)) results.push(el);
  for (const c of el.children) results.push(...findAllEl(c, sel));
  return results;
}

/** Collect all text content recursively */
export function allText(el: MockEl): string {
  let txt = el.text ?? el.textContent ?? "";
  for (const c of el.children) txt += allText(c);
  return txt;
}

/** Collect all descendants (BFS) */
export function collectAll(root: MockEl): MockEl[] {
  const result: MockEl[] = [];
  const stack = [root];
  while (stack.length) {
    const n = stack.pop()!;
    result.push(n);
    for (const c of n.children) stack.push(c);
  }
  return result;
}

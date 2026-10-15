// Keeps an element's text (or one attribute) in the current language. Owners bind once and
// call refresh() on language-changed; elements are updated in place, so moved pieces stay put.
export function binder(text: (key: string) => string) {
  const bound: [Element, string, string | undefined][] = [];
  const apply = ([el, key, attr]: [Element, string, string | undefined]) => {
    if (attr) el.setAttribute(attr, text(key));
    else el.textContent = text(key);
  };
  return {
    bind<E extends Element>(el: E, key: string, attr?: string): E {
      const entry: [Element, string, string | undefined] = [el, key, attr];
      bound.push(entry);
      apply(entry);
      return el;
    },
    refresh() {
      for (const entry of bound) apply(entry);
    },
  };
}

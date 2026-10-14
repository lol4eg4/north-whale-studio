// What the browser remembers between visits: language, sound, pause, the best finale score.
// Storage can be blocked (private mode, in-app browsers): then the site simply remembers nothing.
export interface Memory {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export function createMemory(storage: () => Storage = () => localStorage): Memory {
  return {
    get(key) {
      try {
        return storage().getItem(`nws.${key}`);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        storage().setItem(`nws.${key}`, value);
      } catch {
        // No memory this visit.
      }
    },
  };
}

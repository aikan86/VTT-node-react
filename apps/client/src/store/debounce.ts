import { reportError, track } from "./statusStore";

/**
 * Salvataggio debounced per chiave: l'ultimo valore vince.
 * Le modifiche sono già applicate allo store (ottimistiche); qui si persiste soltanto.
 */
export function createSaver<T>(save: (value: T) => Promise<unknown>, delayMs: number) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const latest = new Map<string, T>();

  const run = (key: string) => {
    timers.delete(key);
    const value = latest.get(key);
    latest.delete(key);
    if (value !== undefined) track(save(value)).catch(reportError);
  };

  return {
    schedule(key: string, value: T) {
      latest.set(key, value);
      const timer = timers.get(key);
      if (timer) clearTimeout(timer);
      timers.set(key, setTimeout(() => run(key), delayMs));
    },
    cancel(key: string) {
      const timer = timers.get(key);
      if (timer) clearTimeout(timer);
      timers.delete(key);
      latest.delete(key);
    },
    flushAll() {
      for (const key of [...timers.keys()]) {
        clearTimeout(timers.get(key));
        run(key);
      }
    },
  };
}

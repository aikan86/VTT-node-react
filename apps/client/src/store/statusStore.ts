import { create } from "zustand";

interface StatusState {
  error: string | null;
  pending: number;
  /** Connessione agli aggiornamenti in tempo reale (null = non ancora tentata). */
  live: boolean | null;
  setLive: (connected: boolean) => void;
  report: (error: unknown) => void;
  dismiss: () => void;
  track: <T>(promise: Promise<T>) => Promise<T>;
}

export const useStatusStore = create<StatusState>((set) => ({
  error: null,
  pending: 0,
  live: null,
  setLive: (live) => set({ live }),
  report: (error) => {
    console.error(error);
    set({ error: error instanceof Error ? error.message : String(error) });
  },
  dismiss: () => set({ error: null }),
  track: async (promise) => {
    set((s) => ({ pending: s.pending + 1 }));
    try {
      return await promise;
    } finally {
      set((s) => ({ pending: s.pending - 1 }));
    }
  },
}));

export const reportError = (error: unknown) => useStatusStore.getState().report(error);
export const track = <T,>(promise: Promise<T>) => useStatusStore.getState().track(promise);

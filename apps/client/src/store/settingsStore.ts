import { create } from "zustand";
import { defaultSettings, type PlayerViewSettings, type Settings, type Versioned } from "@vtt/shared";
import { api, isPermanentError } from "../api/http";
import { reportError, track } from "./statusStore";
import { DocSync } from "./sync/docSync";

interface SettingsState {
  settings: Settings;
  load: () => Promise<void>;
  /** Imposta lo stato noto del server (avvio, test). */
  hydrate: (v: Versioned<Settings>) => void;
  /** Cambia il logo dell'intestazione; `null` torna al logo predefinito. */
  setLogo: (url: string | null) => void;
  /** Cambia cosa vedono i giocatori (iniziativa, PF dei PNG, PF del party). */
  setPlayerView: (patch: Partial<PlayerViewSettings>) => void;
}

function createSync(initial: Versioned<Settings>) {
  return new DocSync<Settings>(initial, {
    save: (settings, rev) => track(api.settings.put(settings, rev)),
    onChange: (settings) => useSettingsStore.setState({ settings }),
    onError: reportError,
    isPermanent: isPermanentError,
    delayMs: 0,
  });
}

let settingsSync = createSync({ rev: 0, data: defaultSettings() });

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: defaultSettings(),

  load: async () => get().hydrate(await api.settings.get()),

  hydrate: (v) => {
    settingsSync.dispose();
    settingsSync = createSync(v);
    set({ settings: v.data });
  },

  setLogo: (url) => settingsSync.apply((s) => ({ ...s, logoUrl: url })),

  setPlayerView: (patch) => settingsSync.apply((s) => ({ ...s, playerView: { ...s.playerView, ...patch } })),
}));

/** Modifica arrivata da un altro tab (il documento sul server ha anche il campo id). */
export function receiveSettings(rev: number, data: unknown) {
  if (data === null) return;
  const { id: _id, ...settings } = data as Settings & { id?: string };
  settingsSync.receive({ rev, data: settings });
}

export async function resyncSettings() {
  settingsSync.receive(await api.settings.get());
}

export const flushSettings = () => settingsSync.flush();

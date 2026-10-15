import { EntrySoundPlayer, type EntrySound } from './entry-sound-player';

const STORAGE_KEY = 'one80_entry_sounds';
export type EntrySoundSettings = { enabled: boolean; volume: number };
const defaults: EntrySoundSettings = { enabled: false, volume: 40 };

function readSettings(): EntrySoundSettings {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    return {
      enabled: value?.enabled === true,
      volume: typeof value?.volume === 'number' && Number.isFinite(value.volume)
        ? Math.max(0, Math.min(100, value.volume)) : defaults.volume,
    };
  } catch { return { ...defaults }; }
}

let settings = readSettings();
const listeners = new Set<() => void>();
const player = new EntrySoundPlayer(() => {
  if (typeof window === 'undefined') return null;
  const Audio = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Audio ? new Audio() : null;
});

export const getEntrySoundSettings = () => settings;

export function setEntrySoundSettings(next: Partial<EntrySoundSettings>): void {
  settings = { ...settings, ...next };
  settings.volume = Number.isFinite(settings.volume) ? Math.max(0, Math.min(100, settings.volume)) : defaults.volume;
  player.stop();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* Session preferences still work. */ }
  listeners.forEach((listener) => listener());
}

function onStorage(event: StorageEvent) {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  settings = readSettings();
  player.stop();
  listeners.forEach((listener) => listener());
}

function onVisibility() {
  if (document.visibilityState !== 'visible') player.stop();
}

export function subscribeEntrySoundSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// The header can check in from pages without a settings control. Keep mute and
// hidden-tab handling active for the lifetime of this one shared player.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', onStorage);
  const prepareOnGesture = (event: Event) => { if (event.isTrusted) prepareEntrySound(); };
  window.addEventListener('pointerdown', prepareOnGesture, { capture: true });
  window.addEventListener('keydown', prepareOnGesture, { capture: true });
  document.addEventListener('visibilitychange', onVisibility);
}

/** Call in the click/Enter handler, before awaiting an API response. */
export function prepareEntrySound(): void {
  if (settings.enabled && settings.volume > 0) void player.prepare();
}

export function playEntrySound(sound: EntrySound, preparedOnly = false): Promise<boolean> {
  if (!settings.enabled || document.visibilityState !== 'visible' || (preparedOnly && !player.ready)) return Promise.resolve(false);
  return player.play(sound, settings.volume);
}

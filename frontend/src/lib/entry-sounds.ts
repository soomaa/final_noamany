import { EntrySoundPlayer, type EntrySound } from './entry-sound-player';
import { ENTRY_VOICE_TEXT, pickArabicVoice, type EntryVoiceCue } from './entry-voice';

/**
 * Check-in sounds (ported from Gymora): a chime on entry, a falling three-note cue on refusal,
 * and — Noamany only — an optional spoken «مقبول / مرفوض / الاشتراك منتهي» right after the chime.
 * Per device (localStorage), because the desk PC and the branch phone have different speakers.
 */
const STORAGE_KEY = 'noamany_entry_sounds';
export type EntrySoundMode = 'chime' | 'voice';
export type EntrySoundSettings = { enabled: boolean; volume: number; mode: EntrySoundMode };
// On by default: reception already heard the refusal buzz before these settings existed.
const defaults: EntrySoundSettings = { enabled: true, volume: 60, mode: 'chime' };

function readSettings(): EntrySoundSettings {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!value || typeof value !== 'object') return { ...defaults };
    return {
      enabled: value.enabled !== false,
      volume: typeof value.volume === 'number' && Number.isFinite(value.volume)
        ? Math.max(0, Math.min(100, value.volume)) : defaults.volume,
      mode: value.mode === 'voice' ? 'voice' : 'chime',
    };
  } catch { return { ...defaults }; }
}

let settings = typeof window === 'undefined' ? { ...defaults } : readSettings();
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
  stopAll();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* Session preferences still work. */ }
  listeners.forEach((listener) => listener());
}

export function subscribeEntrySoundSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// ---- spoken voice -------------------------------------------------------------------------

const synth = (): SpeechSynthesis | null =>
  typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

let arabicVoice: SpeechSynthesisVoice | null = null;
let voicesLoaded = false;
function loadVoices() {
  const s = synth();
  if (!s) return;
  const voices = s.getVoices();
  if (voices.length) voicesLoaded = true;
  arabicVoice = pickArabicVoice(voices);
  listeners.forEach((listener) => listener());
}

/** `unsupported` (no SpeechSynthesis), `loading`, `missing` (no Arabic voice on this device) or `ready`. */
export function arabicVoiceStatus(): 'unsupported' | 'loading' | 'missing' | 'ready' {
  if (!synth()) return 'unsupported';
  if (arabicVoice) return 'ready';
  return voicesLoaded ? 'missing' : 'loading';
}

let speakTimer = 0;
function stopAll() {
  player.stop();
  window.clearTimeout(speakTimer);
  try { synth()?.cancel(); } catch { /* ignore */ }
}

function speak(cue: EntryVoiceCue, delayMs: number) {
  const s = synth();
  if (!s || !arabicVoice) return; // no Arabic voice: the chime alone
  window.clearTimeout(speakTimer);
  speakTimer = window.setTimeout(() => {
    try {
      s.cancel();
      const utterance = new SpeechSynthesisUtterance(ENTRY_VOICE_TEXT[cue]);
      utterance.voice = arabicVoice;
      utterance.lang = arabicVoice!.lang;
      utterance.volume = Math.max(0, Math.min(1, settings.volume / 100));
      utterance.rate = 1;
      s.speak(utterance);
    } catch { /* speech must never interrupt attendance */ }
  }, delayMs);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    settings = readSettings();
    stopAll();
    listeners.forEach((listener) => listener());
  });
  const prepareOnGesture = (event: Event) => { if (event.isTrusted) prepareEntrySound(); };
  window.addEventListener('pointerdown', prepareOnGesture, { capture: true });
  window.addEventListener('keydown', prepareOnGesture, { capture: true });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') stopAll(); });
  const s = synth();
  if (s) {
    loadVoices();
    s.addEventListener?.('voiceschanged', loadVoices);
  }
}

/** Call in the click/Enter handler, before awaiting an API response (unlocks audio on iOS). */
export function prepareEntrySound(): void {
  if (settings.enabled && settings.volume > 0) void player.prepare();
}

/**
 * Plays the result of a check-in or a scan. `expired` uses the refusal chime and, in voice mode,
 * says «الاشتراك منتهي» instead of «مرفوض».
 */
export async function playEntrySound(cue: EntryVoiceCue | EntrySound, preparedOnly = false): Promise<boolean> {
  if (!settings.enabled || settings.volume === 0 || document.visibilityState !== 'visible') return false;
  if (preparedOnly && !player.ready) return false;
  const chime: EntrySound = cue === 'granted' ? 'granted' : 'rejected';
  const played = await player.play(chime, settings.volume);
  if (settings.mode === 'voice') speak(cue, played ? (chime === 'granted' ? 650 : 800) : 0);
  return played || (settings.mode === 'voice' && arabicVoice != null);
}

export type EntrySound = 'granted' | 'rejected';

type Note = { frequency: number; offset: number; duration: number; decay: number; partials: readonly (readonly [number, number])[] };
const piano = [[1, 1], [2, 0.34], [3, 0.16], [4, 0.07]] as const;
const sine = [[1, 1]] as const;
// The exact fourth acceptance and rejection options from the approved preview.
const notes: Record<EntrySound, readonly Note[]> = {
  granted: [
    { frequency: 523.25, offset: 0, duration: 0.36, decay: 6, partials: piano },
    { frequency: 659.25, offset: 0.10, duration: 0.36, decay: 6, partials: piano },
    { frequency: 783.99, offset: 0.20, duration: 0.43, decay: 6, partials: piano },
  ],
  rejected: [
    { frequency: 293.66, offset: 0, duration: 0.075, decay: 0.5, partials: sine },
    { frequency: 293.66, offset: 0.13, duration: 0.075, decay: 0.5, partials: sine },
    { frequency: 246.94, offset: 0.26, duration: 0.11, decay: 0.5, partials: sine },
  ],
};

/** Matches the preview's waveform, envelopes, and loudness normalization. */
export function renderEntrySound(sound: EntrySound, sampleRate: number): Float32Array {
  const cue = notes[sound];
  const duration = Math.max(...cue.map(n => n.offset + n.duration)) + 0.03;
  const samples = new Float32Array(Math.ceil(duration * sampleRate));
  for (const n of cue) {
    let phase = 0;
    const count = Math.floor(n.duration * sampleRate), start = Math.floor(n.offset * sampleRate);
    for (let i = 0; i < count; i++) {
      const t = i / sampleRate, u = t / n.duration;
      phase += 2 * Math.PI * n.frequency / sampleRate;
      const envelope = Math.min(1, t / 0.009) * Math.min(1, (n.duration - t) / 0.035) * Math.exp(-n.decay * u);
      let value = 0;
      for (const [ratio, amplitude] of n.partials) value += Math.sin(phase * ratio) * amplitude;
      samples[start + i] += value * envelope;
    }
  }
  let peak = 0, energy = 0;
  for (const sample of samples) { peak = Math.max(peak, Math.abs(sample)); energy += sample * sample; }
  const scale = Math.min(0.72 / peak, 0.16 / Math.sqrt(energy / samples.length));
  for (let i = 0; i < samples.length; i++) samples[i] *= scale;
  return samples;
}

/** One reusable context; sound failures must never interrupt attendance. */
export class EntrySoundPlayer {
  private context: AudioContext | null = null;
  private voices = new Set<AudioBufferSourceNode>();
  private buffers = new Map<EntrySound, AudioBuffer>();
  private generation = 0;
  private readonly createContext: () => AudioContext | null;

  constructor(createContext: () => AudioContext | null) { this.createContext = createContext; }
  get ready(): boolean { return this.context?.state === 'running'; }

  async prepare(): Promise<boolean> {
    try {
      if (!this.context || this.context.state === 'closed') {
        this.context = this.createContext();
        this.buffers.clear();
      }
      if (!this.context) return false;
      if (this.context.state !== 'running') await this.context.resume();
      return this.context.state === 'running';
    } catch { return false; }
  }

  stop(): void {
    this.generation += 1;
    for (const voice of this.voices) { try { voice.stop(); } catch { /* Already ended. */ } }
    this.voices.clear();
  }

  async play(sound: EntrySound, volume: number): Promise<boolean> {
    this.stop();
    const generation = this.generation;
    const level = Number.isFinite(volume) ? Math.max(0, Math.min(100, volume)) / 100 : 0;
    if (level === 0) return false;
    if (!await this.prepare() || generation !== this.generation) return false;
    const context = this.context!;
    let voice: AudioBufferSourceNode | null = null, gain: GainNode | null = null;
    try {
      let buffer = this.buffers.get(sound);
      if (!buffer) {
        const samples = renderEntrySound(sound, context.sampleRate);
        buffer = context.createBuffer(1, samples.length, context.sampleRate);
        buffer.getChannelData(0).set(samples);
        this.buffers.set(sound, buffer);
      }
      voice = context.createBufferSource(); gain = context.createGain();
      voice.buffer = buffer; gain.gain.setValueAtTime(level, context.currentTime);
      voice.connect(gain); gain.connect(context.destination);
      const source = voice, volumeNode = gain;
      this.voices.add(source);
      source.onended = () => { source.disconnect(); volumeNode.disconnect(); this.voices.delete(source); };
      source.start(context.currentTime + 0.01);
      return true;
    } catch {
      this.stop();
      voice?.disconnect(); gain?.disconnect();
      return false;
    }
  }
}

export function isEntryRejection(error: unknown): boolean {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return status != null && [400, 404, 409, 422].includes(status);
}

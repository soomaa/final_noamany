/**
 * Reception entry sound (client, 22 Nov — MetaFit has one): a short rising chime when a scanned
 * member is checked in, a low double buzz when entry is refused. Made with Web Audio, so there is
 * no file to load; silent where the browser blocks audio.
 */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx ??= new Ctor();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(ac: AudioContext, freq: number, start: number, length: number, type: OscillatorType, volume: number) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, ac.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(volume, ac.currentTime + start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + length);
  osc.connect(gain).connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + length + 0.02);
}

export function playEntrySound(kind: 'granted' | 'rejected') {
  const ac = audio();
  if (!ac) return;
  try {
    if (kind === 'granted') {
      tone(ac, 880, 0, 0.12, 'sine', 0.25);
      tone(ac, 1318.5, 0.12, 0.2, 'sine', 0.25);
    } else {
      tone(ac, 196, 0, 0.18, 'square', 0.12);
      tone(ac, 196, 0.24, 0.24, 'square', 0.12);
    }
  } catch {
    /* audio blocked: stay silent */
  }
}

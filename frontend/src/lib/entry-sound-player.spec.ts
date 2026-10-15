import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { EntrySoundPlayer, isEntryRejection, renderEntrySound } from './entry-sound-player.ts';

function fixture(state = 'running', resume: () => Promise<void> = async () => {}) {
  const voices: any[] = [], buffers: any[] = [], levels: number[] = [];
  const context = {
    state, sampleRate: 24000, currentTime: 10, destination: {}, resume,
    createBuffer(_channels: number, length: number, sampleRate: number) {
      const samples = new Float32Array(length);
      const buffer = { length, sampleRate, duration: length / sampleRate, getChannelData: () => samples };
      buffers.push(buffer); return buffer;
    },
    createBufferSource() {
      const voice = { buffer: null, connect() {}, disconnect() {}, start() {}, stops: [] as number[], stop() { voice.stops.push(-1); }, onended: null };
      voices.push(voice); return voice;
    },
    createGain() { return { gain: { setValueAtTime(value: number) { levels.push(value); } }, connect() {}, disconnect() {} }; },
  };
  let created = 0;
  const player = new EntrySoundPlayer(() => { created++; return context as unknown as AudioContext; });
  return { player, voices, buffers, levels, context, created: () => created };
}

test('waveforms exactly match the two approved option-4 demo WAVs', () => {
  const expected = {
    granted: { length: 15840, hash: '6cd8748309c6e5bee8be568289dbd8ede330488cf2b96adc8ec31517173fdede' },
    rejected: { length: 9600, hash: 'b58c49334cf673866cd2d92731af0140f74711961fea04d056b5bad41be98e4e' },
  };
  for (const sound of ['granted', 'rejected'] as const) {
    const samples = renderEntrySound(sound, 24000), pcm = Buffer.alloc(samples.length * 2);
    samples.forEach((value, i) => pcm.writeInt16LE(Math.round(value * 32767), i * 2));
    assert.equal(samples.length, expected[sound].length);
    assert.equal(createHash('sha256').update(pcm).digest('hex'), expected[sound].hash);
    assert(samples.every(value => Number.isFinite(value) && Math.abs(value) <= 0.721));
  }
});

test('one reusable context and two cached buffers retain the selected sounds and volume', async () => {
  const f = fixture();
  assert.equal(await f.player.play('granted', 40), true);
  assert.equal(await f.player.play('rejected', 25), true);
  assert.equal(await f.player.play('granted', 40), true);
  assert.equal(f.created(), 1); assert.equal(f.buffers.length, 2);
  assert.equal(f.voices[0].buffer, f.voices[2].buffer);
  assert.equal(f.voices[0].buffer.duration, 0.66);
  assert.equal(f.voices[1].buffer.duration, 0.4);
  assert.deepEqual(f.levels, [0.4, 0.25, 0.4]);
});

test('mute creates no resources and the latest cue cancels earlier playback', async () => {
  const f = fixture();
  assert.equal(await f.player.play('granted', 0), false); assert.equal(f.created(), 0);
  await f.player.play('granted', 40); await f.player.play('rejected', 40);
  assert.deepEqual(f.voices[0].stops, [-1]); f.player.stop(); assert.deepEqual(f.voices[1].stops, [-1]);
});

test('muting while the browser resumes prevents delayed playback', async () => {
  let resolve!: () => void;
  const f = fixture('suspended', () => new Promise<void>(r => { resolve = r; }));
  const pending = f.player.play('granted', 40); f.player.stop(); f.context.state = 'running'; resolve();
  assert.equal(await pending, false); assert.equal(f.voices.length, 0);
});

test('unavailable audio never interrupts attendance', async () => {
  const f = fixture('suspended', async () => { throw new Error('NotAllowedError'); });
  assert.equal(await f.player.play('granted', 40), false); assert.equal(f.voices.length, 0);
  assert.equal(await new EntrySoundPlayer(() => null).play('rejected', 40), false);
});

test('only business entry refusals get the rejection cue', () => {
  for (const status of [400, 404, 409, 422]) assert(isEntryRejection({ response: { status } }));
  for (const status of [401, 403, 500, 502, 503]) assert(!isEntryRejection({ response: { status } }));
  assert(!isEntryRejection(new Error('Network error'))); assert(!isEntryRejection(null));
});

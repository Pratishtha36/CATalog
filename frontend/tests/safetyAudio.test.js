import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { SAFETY_LANGUAGES } from '../src/lib/safetyAudio.js';
import { createSafetyAudioPlayer } from '../src/lib/safetyAudioPlayer.js';

const manifest = JSON.parse(readFileSync(new URL('../src/lib/safetyAudioManifest.json', import.meta.url), 'utf8'));

test('every selectable language includes greeting and seatbelt files matching its text', () => {
  assert.equal(SAFETY_LANGUAGES.length, 10);
  for (const language of SAFETY_LANGUAGES) {
    for (const prompt of ['greeting', 'seatbelt']) {
      const clip = manifest[language.code][prompt];
      assert.equal(clip.text, language[prompt]);
      assert.ok(clip.duration_seconds > 0.5);
      const digest = createHash('sha256').update(language[prompt]).digest('hex').slice(0, 10);
      assert.ok(clip.url.endsWith(`-${digest}.mp3`));
      const file = new URL(`../public${clip.url}`, import.meta.url);
      assert.equal(statSync(file).size, clip.bytes);
      assert.ok(clip.bytes > 1000);
    }
  }
});

test('Punjabi plays a bundled clip without accessing browser speech voices', async () => {
  const audio = { pause() {}, play: async () => {} };
  const player = createSafetyAudioPlayer({ createAudio: () => audio });
  assert.equal(await player.play(manifest['pa-IN'].seatbelt.url), 'started');
  assert.equal(audio.src, manifest['pa-IN'].seatbelt.url);
});

test('switching languages cancels stale playback promises and late errors', async () => {
  let resolveFirst;
  let calls = 0;
  const errors = [];
  const audio = { pause() {}, play: () => ++calls === 1 ? new Promise(resolve => { resolveFirst = resolve; }) : Promise.resolve() };
  const player = createSafetyAudioPlayer({ createAudio: () => audio, onError: message => errors.push(message) });
  const old = player.play('/punjabi.mp3');
  const oldError = audio.onerror;
  assert.equal(await player.play('/tamil.mp3'), 'started');
  resolveFirst();
  assert.equal(await old, 'cancelled');
  oldError();
  assert.deepEqual(errors, []);
  player.stop();
  assert.equal(audio.onerror, null);
});

test('autoplay denial gives an actionable retry instead of reporting enabled audio', async () => {
  const errors = [];
  const failure = Object.assign(new Error('Blocked'), { name: 'NotAllowedError' });
  const player = createSafetyAudioPlayer({ createAudio: () => ({ pause() {}, play: async () => { throw failure; } }), onError: message => errors.push(message) });
  assert.equal(await player.play('/sample.mp3'), 'failed');
  assert.match(errors[0], /Allow sound/);
});

test('failed media requests report a load failure', async () => {
  const errors = [];
  const audio = { pause() {}, play: async () => {} };
  const player = createSafetyAudioPlayer({ createAudio: () => audio, onError: message => errors.push(message) });
  await player.play('/sample.mp3');
  audio.onerror();
  assert.match(errors[0], /could not be loaded/);
});

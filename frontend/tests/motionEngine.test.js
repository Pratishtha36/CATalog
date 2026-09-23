import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ACTIVITIES, sampleFromEvent, windowFeatures, createWindower, createActivityTracker, classifyMotion, simulateSample, MOTION_SCHEMA, FEATURE_NAMES } from '../src/lib/motionEngine.js';

test('exported sklearn forest classifies demo waveforms in JavaScript', async () => {
  const model = JSON.parse(await readFile(new URL('../../backend/ml/artifacts/demo-model.json', import.meta.url), 'utf8'));
  for (const label of ACTIVITIES) {
    const samples = Array.from({ length: 101 }, (_, index) => simulateSample(label, index * 20));
    const prediction = classifyMotion(windowFeatures(samples, 2000), 'model', model, 'simulation');
    assert.equal(prediction.method, 'random_forest');
    assert.equal(prediction.activity, label);
    assert.equal(classifyMotion(windowFeatures(samples, 2000), 'model', model, 'phone').method, 'rules');
  }
});

test('unavailable or incomplete sensor vectors are not fabricated', () => {
  assert.equal(sampleFromEvent({ accelerationIncludingGravity: null }, 0), null);
  assert.equal(sampleFromEvent({ accelerationIncludingGravity: { x: null, y: 1, z: 2 } }, 0), null);
  const sample = sampleFromEvent({ accelerationIncludingGravity: { x: 0, y: 0, z: 9.81 } }, 20);
  assert.equal(sample.az, 9.81);
  assert.equal(sample.gz, 0);
});

test('resampling produces expected population features in documented order', () => {
  const samples = Array.from({ length: 101 }, (_, i) => ({ t: i * 20, ax: i, ay: 2, az: 9.81, gx: 0, gy: 0, gz: 0 }));
  const { features } = windowFeatures(samples, 2000);
  assert.equal(features.length, 9);
  assert.equal(features[0], 49.5);
  assert.ok(Math.abs(features[1] - Math.sqrt(833.25)) < 1e-10);
  assert.equal(features[2], 3283.5);
  assert.equal(features[3], 2);
  assert.equal(features[4], 0);
  assert.equal(features[5], 4);
});

test('overlapping windows count coverage once and omit sensor gaps', () => {
  const windower = createWindower();
  const windows = [];
  for (let t = 0; t <= 10000; t += 20) { const window = windower.push(simulateSample('idle', t)); if (window && !window.invalid) windows.push(window); }
  assert.equal(windows.length, 9);
  assert.equal(windows.reduce((sum, window) => sum + window.seconds, 0), 10);
  assert.equal(windower.push(simulateSample('idle', 20000)), null);
  const resumed = [];
  for (let t = 20020; t <= 22000; t += 20) { const window = windower.push(simulateSample('idle', t)); if (window && !window.invalid) resumed.push(window); }
  assert.equal(resumed.length, 1);
  assert.equal(resumed[0].seconds, 2);
  assert.equal(resumed[0].reset, true);
});

test('rules recognise the controlled demo waveforms without a model', () => {
  for (const label of ACTIVITIES) {
    const samples = Array.from({ length: 101 }, (_, index) => simulateSample(label, index * 20));
    const result = classifyMotion(windowFeatures(samples, 2000), 'rules', null, 'simulation');
    assert.equal(result.activity, label);
  }
});

test('cycle counter debounces changes and requires dig-swing-dig in order', () => {
  const tracker = createActivityTracker();
  let count = 0;
  for (const label of ['dig','dig','swing','swing','swing','dig','dig','dig']) count += tracker.update(label).cycles;
  assert.equal(count, 1);
  tracker.reset();
  for (const label of ['dig','dig','swing','swing','travel','travel','dig','dig']) assert.equal(tracker.update(label).cycles, 0);
  tracker.reset();
  assert.equal(tracker.update('dig').activity, 'unknown');
  assert.equal(tracker.update('swing').cycles, 0);
});

test('synthetic, unavailable and low-confidence models fall back on phone readings', () => {
  const window = windowFeatures(Array.from({length: 101}, (_, i) => simulateSample('idle', i * 20)), 2000);
  const model = { id: 'test', schema: MOTION_SCHEMA, features: FEATURE_NAMES, classes: ACTIVITIES,
    training_source: 'simulation', trees: [{ left: [-1], right: [-1], feature: [-2], threshold: [-2], probabilities: [[0,1,0,0]] }] };
  assert.equal(classifyMotion(window, 'model', model, 'phone').method, 'rules');
  assert.equal(classifyMotion(window, 'model', model, 'simulation').activity, 'dig');
  model.trees[0].probabilities[0] = [.25,.25,.25,.25];
  assert.equal(classifyMotion(window, 'model', model, 'simulation').method, 'rules');
  model.trees[0].left = [0]; model.trees[0].feature = [0];
  assert.equal(classifyMotion(window, 'model', model, 'simulation').method, 'rules');
});

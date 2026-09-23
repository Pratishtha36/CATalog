export const ACTIVITIES = ['idle', 'dig', 'swing', 'travel'];
export const FEATURE_NAMES = ['ax', 'ay', 'az'].flatMap(axis => ['mean', 'std', 'energy'].map(stat => `${axis}_${stat}`));
export const MOTION_SCHEMA = 'acceleration-including-gravity-50hz-v1';

export function sampleFromEvent(event, t) {
  const a = event.accelerationIncludingGravity;
  if (!a || ![a.x, a.y, a.z].every(Number.isFinite)) return null;
  if ([a.x, a.y, a.z].some(value => Math.abs(value) > 200)) return null;
  const g = event.rotationRate;
  return { t, ax: a.x, ay: a.y, az: a.z,
    gx: Number.isFinite(g?.alpha) ? g.alpha : 0,
    gy: Number.isFinite(g?.beta) ? g.beta : 0,
    gz: Number.isFinite(g?.gamma) ? g.gamma : 0 };
}

export function windowFeatures(samples, end) {
  if (samples.length < 40) throw new Error('At least 40 readings are needed per window.');
  if (samples[0].t > end - 2000 || samples.at(-1).t < end - 20) throw new Error('Incomplete motion window.');
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].t <= samples[i - 1].t || samples[i].t - samples[i - 1].t > 250) throw new Error('Sensor gap in motion window.');
  }
  const axes = { ax: [], ay: [], az: [], gx: [], gy: [], gz: [] };
  let index = 0;
  for (let i = 0; i < 100; i++) {
    const t = end - 2000 + i * 20;
    while (index + 1 < samples.length - 1 && samples[index + 1].t < t) index++;
    const a = samples[index], b = samples[Math.min(index + 1, samples.length - 1)];
    const fraction = b.t === a.t ? 0 : Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t)));
    for (const axis of Object.keys(axes)) axes[axis].push(a[axis] + fraction * (b[axis] - a[axis]));
  }
  const features = [];
  for (const axis of ['ax', 'ay', 'az']) {
    const values = axes[axis];
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    const energy = values.reduce((sum, value) => sum + value ** 2, 0) / values.length;
    features.push(mean, Math.sqrt(variance), energy);
  }
  const gyro = Math.sqrt(axes.gx.reduce((sum, _, i) => sum + axes.gx[i] ** 2 + axes.gy[i] ** 2 + axes.gz[i] ** 2, 0) / 100);
  return { features, gyro, hz: (samples.length - 1) * 1000 / (samples.at(-1).t - samples[0].t) };
}

export function createWindower() {
  let samples = [], nextEnd = null, lastEnd = null;
  return {
    push(sample) {
      const last = samples.at(-1);
      if (last && sample.t <= last.t) return null;
      const reset = last && sample.t - last.t > 250;
      if (reset) { samples = []; nextEnd = null; lastEnd = null; }
      samples.push(sample);
      nextEnd ??= sample.t + 2000;
      if (sample.t < nextEnd) return null;
      const end = nextEnd;
      nextEnd += 1000;
      const window = samples.filter(item => item.t >= end - 2200);
      samples = samples.filter(item => item.t >= end - 2200);
      try {
        const result = windowFeatures(window, end);
        const seconds = lastEnd === null ? 2 : Math.min(1, (end - lastEnd) / 1000);
        lastEnd = end;
        return { ...result, end, seconds, reset: reset || seconds === 2 };
      } catch { lastEnd = null; return { invalid: true, end }; }
    },
  };
}

export function classifyRules(features, gyro = 0) {
  const variation = Math.hypot(features[1], features[4], features[7]);
  if (gyro > 18) return 'swing';
  if (variation < .18) return 'idle';
  if (variation > 1.5) return 'dig';
  return 'travel';
}

export function usableModel(model, source) {
  return model?.schema === MOTION_SCHEMA && model.training_source === source &&
    JSON.stringify(model.features) === JSON.stringify(FEATURE_NAMES) &&
    Array.isArray(model.classes) && model.classes.length === 4 && model.classes.every(label => ACTIVITIES.includes(label)) &&
    Array.isArray(model.trees) && model.trees.length > 0 && model.trees.length <= 200;
}

export function classifyMotion(window, mode, model, source) {
  const fallback = reason => ({ activity: classifyRules(window.features, window.gyro), method: 'rules', confidence: null, reason });
  if (mode !== 'model') return fallback('Local threshold rules');
  if (!usableModel(model, source)) return fallback('No matching model available; using rules');
  try {
    const scores = model.classes.map(() => 0);
    for (const tree of model.trees) {
      let node = 0, steps = 0;
      while (tree.left[node] !== -1) {
        if (++steps > 100 || !Number.isInteger(tree.feature[node]) || tree.feature[node] < 0 || tree.feature[node] > 8) throw new Error('Invalid forest');
        node = Math.fround(window.features[tree.feature[node]]) <= tree.threshold[node] ? tree.left[node] : tree.right[node];
      }
      const values = tree.probabilities[node];
      if (!values || values.length !== scores.length || !values.every(Number.isFinite)) throw new Error('Invalid leaf');
      values.forEach((value, index) => { scores[index] += value / model.trees.length; });
    }
    const confidence = Math.max(...scores);
    const index = scores.indexOf(confidence);
    if (confidence < .55) return fallback('Low model vote share; using rules');
    return { activity: model.classes[index], method: 'random_forest', confidence, reason: `Forest ${model.id}` };
  } catch { return fallback('Model could not be evaluated; using rules'); }
}

export function createActivityTracker() {
  let stable = 'unknown', candidate = null, streak = 0, phase = null;
  return {
    reset() { stable = 'unknown'; candidate = null; streak = 0; phase = null; },
    update(activity) {
      if (activity === candidate) streak++; else { candidate = activity; streak = 1; }
      let cycles = 0;
      if (streak >= 2 && activity !== stable) {
        stable = activity;
        if (stable === 'dig') { if (phase === 'swing') cycles = 1; phase = 'dig'; }
        else if (stable === 'swing') phase = phase === 'dig' ? 'swing' : null;
        else phase = null;
      }
      return { activity: stable, cycles };
    },
  };
}

export function simulateSample(label, t) {
  const wave = frequency => Math.sin(t / 1000 * Math.PI * 2 * frequency);
  const noise = .025 * wave(7.13);
  let ax = noise, ay = noise, az = 9.81 + noise, gz = 0;
  if (label === 'dig') { ax = 3 * wave(2); ay = 2 * wave(1.7); az += 2 * wave(2.5); gz = 5 * wave(1); }
  if (label === 'swing') { ax = 2 * wave(.5); ay = 2 * wave(.6); az += .3 * wave(.5); gz = 45 * wave(.5); }
  if (label === 'travel') { ax = .6 * wave(1.5); ay = .5 * wave(1.2); az += .8 * wave(1.8); gz = 2 * wave(.8); }
  return { t, ax, ay, az, gx: 0, gy: 0, gz };
}

export async function startPhoneCapture(onSample, onFailure) {
  if (!window.isSecureContext) throw new Error('Phone sensors require HTTPS. Open the deployed app on your phone.');
  if (!window.DeviceMotionEvent) throw new Error('This device has no motion API. Use a phone or the labelled laptop simulator.');
  if (typeof DeviceMotionEvent.requestPermission === 'function' && await DeviceMotionEvent.requestPermission() !== 'granted') throw new Error('Motion permission denied. Allow it in browser settings and retry.');
  const start = performance.now();
  let lastReading = start;
  let received = false;
  const listener = event => {
    const sample = sampleFromEvent(event, performance.now() - start);
    if (sample) { lastReading = performance.now(); received = true; onSample(sample); }
  };
  const timer = setInterval(() => {
    if (performance.now() - lastReading > (received ? 3500 : 8000)) {
      stop();
      onFailure(received ? 'Sensor readings stopped. Capture paused; saved observations are kept.' : 'No motion readings received. This Windows laptop may have no sensors; use the simulator or a phone.');
    }
  }, 1000);
  function stop() { window.removeEventListener('devicemotion', listener); clearInterval(timer); }
  window.addEventListener('devicemotion', listener);
  return stop;
}

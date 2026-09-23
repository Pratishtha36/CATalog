import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Download, Play, Square, Radio, RefreshCw, Database, Smartphone } from 'lucide-react';
import { post, request } from '../lib/api';
import { ACTIVITIES, createWindower, createActivityTracker, classifyMotion, simulateSample, startPhoneCapture, usableModel } from '../lib/motionEngine';
import { createMotionStore, recordingsCsv } from '../lib/motionStore';
import { useOperatorWorkspace } from './OperatorWorkspace';

const store = createMotionStore();
let pendingWrites = Promise.resolve();
const initial = { activity: 'unknown', seconds: 0, idle: 0, continuousIdle: 0, cycles: 0, hz: 0, samples: 0, method: 'rules', confidence: null, points: [] };
const activityName = (activity, engine) => activity === 'idle' ? engine ? 'Estimated idle' : 'Stationary' : activity === 'unknown' ? 'Calibrating' : `Estimated ${activity}`;
const newId = () => crypto.randomUUID();
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function tabId() {
  try {
    const existing = sessionStorage.getItem('cabwise.motion.tab');
    if (existing) return existing;
    const value = newId(); sessionStorage.setItem('cabwise.motion.tab', value); return value;
  } catch { return newId(); }
}

export default function Live() {
  const { data, operatorId, error: workspaceError } = useOperatorWorkspace();
  const [source, setSource] = useState('phone');
  const [mode, setMode] = useState('rules');
  const [engineRunning, setEngineRunning] = useState(false);
  const [simulationLabel, setSimulationLabel] = useState('idle');
  const [recordLabel, setRecordLabel] = useState('idle');
  const [status, setStatus] = useState('Ready');
  const [running, setRunning] = useState(false);
  const [view, setView] = useState(initial);
  const [error, setError] = useState('');
  const [queueCount, setQueueCount] = useState(0);
  const [recordings, setRecordings] = useState([]);
  const [recordingActive, setRecordingActive] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [model, setModel] = useState(null);
  const [modelMessage, setModelMessage] = useState('Rules are available without a model.');
  const [training, setTraining] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [lastBatch, setLastBatch] = useState(null);
  const mounted = useRef(false);
  const runtime = useRef(null);
  const startVersion = useRef(0);
  const simLabelRef = useRef(simulationLabel);
  const tabRef = useRef(null);
  const stopRef = useRef(() => {});
  simLabelRef.current = simulationLabel;

  async function refreshStorage() {
    const [count, records] = await Promise.all([store.db.queue.count(), store.db.recordings.toArray()]);
    if (mounted.current) { setQueueCount(count); setRecordings(records); }
  }

  async function sync() {
    if (!navigator.onLine) { await refreshStorage(); return; }
    try {
      const count = await store.sync(payload => post('/api/motion/ingest', payload));
      if (mounted.current) {
        setError(current => current.startsWith('Sync pending:') ? '' : current);
        if (count) setStatus(`Synced ${count} observation batch${count === 1 ? '' : 'es'}`);
      }
    } catch (failure) {
      if (mounted.current) setError(`Sync pending: ${failure.message}`);
    } finally { await refreshStorage().catch(() => {}); }
  }

  useEffect(() => {
    mounted.current = true;
    tabRef.current ||= tabId();
    store.db.open().then(() => pendingWrites).then(() => store.recover(tabRef.current)).then(() => {
      if (mounted.current) setStorageReady(true);
      return refreshStorage();
    }).then(sync).catch(failure => mounted.current && setError(`Local storage unavailable: ${failure.message}`));
    const online = () => { void sync(); };
    const hidden = () => { if (document.hidden) stopRef.current('Paused because the page is hidden.'); };
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', hidden);
    const timer = setInterval(online, 10000);
    return () => {
      stopRef.current('Capture stopped when leaving SwingSense.');
      mounted.current = false;
      startVersion.current++;
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', hidden);
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;
    setModel(null);
    setModelMessage('Checking model availability…');
    (async () => {
      const cached = await store.db.settings.get(`model:${source}`);
      if (active && usableModel(cached?.value, source)) setModel(cached.value);
      try {
        const fresh = await request(`/api/motion/model?source=${source}`);
        if (!usableModel(fresh, source)) throw new Error('Model schema/source mismatch');
        await store.db.settings.put({ key: `model:${source}`, value: fresh });
        if (active) { setModel(fresh); setModelMessage(source === 'simulation' ? 'Synthetic demo forest — not measured machine accuracy.' : 'Forest trained on labelled phone takes; field accuracy is unverified.'); }
      } catch {
        if (active) setModelMessage(usableModel(cached?.value, source) ? 'Using the cached model; local inference is available offline.' : source === 'phone' ? 'No phone-trained model yet. Collect labelled takes below; rules remain available.' : 'Demo model unavailable. Rules remain available.');
      }
    })().catch(failure => active && setModelMessage(`Model unavailable: ${failure.message}. Using rules.`));
    return () => { active = false; };
  }, [source]);

  useEffect(() => { if (runtime.current && runtime.current.operator !== operatorId) stopRef.current('Capture stopped because the operator changed.'); }, [operatorId]);

  function appendWrite(run, operation) {
    run.writes = pendingWrites = pendingWrites.then(operation).catch(failure => {
      if (mounted.current) setError(`Could not save locally: ${failure.message}. Stop and check browser storage.`);
      run.storageFailed = true;
    });
  }

  function finishRecording(run) {
    const recording = run.recording;
    run.recording = null;
    if (!recording) return;
    if (mounted.current) { setRecordingActive(false); setRecordSeconds(0); }
    const duration = recording.samples.length ? recording.samples.at(-1).t - recording.samples[0].t : 0;
    if (duration < 2000 || recording.samples.length < 40) {
      if (mounted.current) setError('Labelled take was too short; record at least 2 seconds.');
      return;
    }
    appendWrite(run, () => store.db.recordings.put(recording).then(refreshStorage));
  }

  function flush(run) {
    if (!run.batch || run.batch.observed_seconds <= 0) return;
    const payload = structuredClone(run.batch);
    appendWrite(run, async () => { await store.finalize(payload); await refreshStorage(); void sync(); });
    if (mounted.current) setLastBatch(payload);
    run.sequence++;
    run.batch = null;
  }

  function stop(message = 'Capture stopped. Saved observations are kept.') {
    startVersion.current++;
    const run = runtime.current;
    runtime.current = null;
    if (run) { run.stop?.(); finishRecording(run); flush(run); }
    if (mounted.current) { setRunning(false); setStatus(message); }
  }
  stopRef.current = stop;

  async function start() {
    if (!storageReady || running || runtime.current || !data?.shift) return;
    setError(''); setStatus(source === 'phone' ? 'Requesting phone sensors…' : 'Starting explicit simulation…'); setRunning(true);
    const version = ++startVersion.current;
    const run = { operator: operatorId, source, mode, model, engine: engineRunning, session: newId(), sequence: 0,
      windower: createWindower(), tracker: createActivityTracker(), wallStart: Date.now(), total: { ...initial, points: [] },
      writes: Promise.resolve(), samples: 0, lastPaint: 0, batch: null, recording: null, storageFailed: false };
    runtime.current = run;
    const onSample = sample => {
      if (runtime.current !== run) return;
      if (run.storageFailed) { stop('Capture stopped because local storage failed.'); return; }
      run.samples++;
      if (run.recording) {
        run.recording.samples.push(sample);
        if (sample.t - run.recording.started >= 15000) finishRecording(run);
      }
      const window = run.windower.push(sample);
      if (window?.invalid) { run.tracker.reset(); if (mounted.current) setStatus('Insufficient sample coverage; waiting for a complete window.'); }
      if (window && !window.invalid) {
        if (window.reset) run.tracker.reset();
        const prediction = classifyMotion(window, run.mode, run.model, run.source);
        const result = run.tracker.update(prediction.activity);
        const idle = result.activity === 'idle' && run.engine ? window.seconds : 0;
        run.total = { ...run.total, activity: result.activity, seconds: run.total.seconds + window.seconds,
          idle: run.total.idle + idle, continuousIdle: idle ? run.total.continuousIdle + idle : 0, cycles: run.total.cycles + result.cycles, hz: window.hz,
          method: prediction.method, confidence: prediction.confidence, reason: prediction.reason,
          points: [...run.total.points.slice(-39), Math.hypot(window.features[1], window.features[4], window.features[7])] };
        const end = new Date(run.wallStart + window.end).toISOString();
        run.batch ||= { id: newId(), session_id: run.session, sequence: run.sequence, operator_id: run.operator,
          machine_id: 'MC1001', source: run.source, classifier: prediction.method, engine_running: run.engine,
          started_at: new Date(run.wallStart + window.end - window.seconds * 1000).toISOString(),
          ended_at: end, observed_seconds: 0, idle_seconds: 0, load_cycles: 0, activity: result.activity };
        run.batch.ended_at = end;
        run.batch.observed_seconds += window.seconds;
        run.batch.idle_seconds += idle;
        run.batch.load_cycles += result.cycles;
        run.batch.activity = result.activity;
        if (run.batch.classifier !== prediction.method) run.batch.classifier = 'mixed';
        const snapshot = structuredClone(run.batch);
        appendWrite(run, () => store.saveDraft(snapshot, tabRef.current));
        if (run.batch.observed_seconds >= 60) flush(run);
      }
      if (sample.t - run.lastPaint >= 200) {
        run.lastPaint = sample.t;
        if (mounted.current) {
          setView({ ...run.total, samples: run.samples });
          if (run.recording) setRecordSeconds(Math.max(0, (sample.t - run.recording.started) / 1000));
        }
      }
      run.lastSample = sample;
    };
    try {
      setView(initial);
      if (source === 'phone') {
        run.stop = await startPhoneCapture(onSample, failure => { stop(failure); if (mounted.current) setError(failure); });
        // Sensor elapsed times begin after any permission prompt.
        run.wallStart = Date.now();
      } else {
        const started = performance.now();
        const timer = setInterval(() => onSample(simulateSample(simLabelRef.current, performance.now() - started)), 20);
        run.stop = () => clearInterval(timer);
      }
      if (!mounted.current || startVersion.current !== version) { run.stop?.(); return; }
      setStatus(source === 'phone' ? 'Listening to phone motion. Keep this page open.' : 'SIMULATION — generated motion, not machine telemetry.');
    } catch (failure) { stop(failure.message); if (mounted.current) setError(failure.message); }
  }

  function record() {
    const run = runtime.current;
    if (!run?.lastSample || run.recording) return;
    run.recording = { id: newId(), label: source === 'simulation' ? simulationLabel : recordLabel,
      source, createdAt: Date.now(), started: run.lastSample.t, samples: [] };
    setRecordingActive(true); setRecordSeconds(0);
  }

  async function train() {
    setTraining(true); setError('');
    try {
      const records = await store.db.recordings.where('source').equals('phone').toArray();
      const artifact = await post('/api/motion/train', { recordings: records.map(({ id, label, source, samples }) => ({ id, label, source, samples })) });
      await store.db.settings.put({ key: 'model:phone', value: artifact });
      if (mounted.current) { setModel(artifact); setModelMessage('Phone model trained. Review the held-out results below; field validation is still needed.'); }
    } catch (failure) { if (mounted.current) setError(failure.message); }
    finally { if (mounted.current) setTraining(false); }
  }

  const phoneRecords = recordings.filter(recording => recording.source === 'phone');
  const counts = Object.fromEntries(ACTIVITIES.map(label => [label, phoneRecords.filter(recording => recording.label === label).length]));
  const canTrain = ACTIVITIES.every(label => counts[label] >= 3);
  const idleThreshold = source === 'simulation' ? 10 : 1200;
  const catRow = lastBatch && { timestamp: lastBatch.ended_at, machine_id: lastBatch.machine_id, operator_id: lastBatch.operator_id,
    engine_hours: null, fuel_used_l: null, load_cycles: lastBatch.load_cycles,
    idling_time_min: lastBatch.engine_running ? lastBatch.idle_seconds / 60 : null,
    seatbelt_status: null, safety_alert_triggered: null, data_source: lastBatch.source === 'phone' ? 'phone_estimate' : 'simulation' };

  return <><div className="page-heading"><div><p className="eyebrow">SWINGSENSE</p><h1>A working day, in motion.</h1><p className="muted">Estimate activity from a mounted phone. Collect labelled takes to improve the classifier.</p></div><span className="badge">{source === 'phone' ? 'Phone sensor estimates' : 'SIMULATION · Synthetic data'}</span></div>
    {error && <div className="error-banner" role="alert"><p>{error}</p><button className="text-link" onClick={() => setError('')}>Dismiss</button></div>}
    <section className="motion-controls"><label>Input<select value={source} disabled={running || training} onChange={event => { setSource(event.target.value); setView(initial); setLastBatch(null); }}>{[['phone', 'Phone sensors'], ['simulation', 'Laptop simulator (synthetic)']].map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
      <label>Classifier<select value={mode} disabled={running} onChange={event => setMode(event.target.value)}><option value="rules">Threshold rules (default)</option><option value="model">Random Forest + rules fallback</option></select></label>
      <label className="engine-checkbox"><input type="checkbox" checked={engineRunning} disabled={running} onChange={event => setEngineRunning(event.target.checked)}/>I confirm the engine is running{source === 'simulation' && ' (simulated)'}</label>
      <div className="motion-buttons"><button className="button primary" disabled={running || training || !storageReady || !data?.shift || !!workspaceError} onClick={start}><Play size={16}/>Start capture</button><button className="button neutral" disabled={!running} onClick={() => stop()}><Square size={16}/>Stop & save</button></div>
      {!data?.shift && <p className="small-note"><Link className="text-link" to="/">Start your shift in My Day first.</Link></p>}
      <p className="small-note">Phone sensors need HTTPS and foreground access. Stationary motion alone cannot identify engine-off or idle. Fuel and seatbelt readings are not inferred.</p>
    </section>
    {source === 'simulation' && <section className="simulation-panel"><strong>Laptop simulator · Generated samples only</strong><p>Hold each action for at least 5 seconds. Try dig → swing → dig to demonstrate an estimated cycle.</p><div className="simulation-actions">{ACTIVITIES.map(label => <button className={`button ${simulationLabel === label ? 'primary' : 'neutral'}`} key={label} disabled={recordingActive} onClick={() => setSimulationLabel(label)}>{label === 'idle' ? 'Stationary / idle' : label}</button>)}</div><p className="small-note">The visual idle warning uses a shortened 10-second threshold here. Phone mode uses 20 minutes; elapsed time is never accelerated.</p></section>}
    <section className="motion-live"><div><span className="eyebrow">CURRENT ESTIMATE</span><h2>{activityName(view.activity, engineRunning)}</h2><p role="status">{status}</p><span className="badge">{view.method === 'rules' ? 'Threshold rules' : 'Random Forest'}{view.confidence !== null ? ` · ${(view.confidence * 100).toFixed(0)}% vote share` : ''}</span><p className="small-note">{view.reason || 'First estimate needs two complete windows.'} Model vote share is not calibrated accuracy.</p></div><svg viewBox="0 0 320 100" role="img" aria-label="Recent acceleration variation"><path d="M0 80H320" stroke="#d8dfd0"/><polyline fill="none" stroke="#c69614" strokeWidth="3" points={view.points.map((value, i) => `${i * 320 / 39},${85 - Math.min(value, 5) * 15}`).join(' ')}/></svg></section>
    <div className="day-summary motion-metrics"><div><Activity size={20}/><strong>{view.cycles}</strong><span>Estimated cycles</span></div><div><Radio size={20}/><strong>{Math.round(view.idle)} s</strong><span>{engineRunning ? 'Estimated idle' : 'Idle not inferred'}</span></div><div><Smartphone size={20}/><strong>{view.hz.toFixed(0)} Hz</strong><span>{view.samples} readings · {view.seconds} s observed</span></div></div>
    {view.continuousIdle >= idleThreshold && engineRunning && <div className="context-banner" role="alert"><strong>{source === 'simulation' ? 'DEMO: 10-second idle threshold reached.' : 'Estimated idle time has exceeded 20 minutes.'}</strong><p>Check whether the stationary reading reflects an actual idle machine.</p></div>}
    <section className="shift-panel"><Database size={24}/><div><h3>{queueCount} batches waiting to sync</h3><p>Observations are saved locally as they arrive, queued every 60 observed seconds and on stop. Retries use the same ID to prevent duplicate server rows.</p></div><button className="button neutral" onClick={() => sync()} disabled={!storageReady}><RefreshCw size={16}/>Sync now</button></section>
    {catRow && <details className="motion-details"><summary>Latest queued observation in CAT’s column layout</summary><pre>{JSON.stringify(catRow, null, 2)}</pre><p className="small-note">Cycles and idle are estimates. The queue count above indicates pending uploads; this preview is not a server receipt.</p></details>}
    <section className="recording-panel"><p className="eyebrow">LABELLED MOTION COLLECTION</p><h2>Teach it with separate recordings.</h2><p>Record 15-second takes while holding still, mimicking digging, rotating the phone, or walking. Keep the mounting orientation consistent. Record at least 3 takes per class; aim for 10–15 minutes across varied takes.</p><div className="record-controls"><label>Ground-truth label<select value={source === 'simulation' ? simulationLabel : recordLabel} disabled={recordingActive || source === 'simulation'} onChange={event => setRecordLabel(event.target.value)}>{ACTIVITIES.map(label => <option key={label}>{label}</option>)}</select></label><button className="button secondary" disabled={!running || recordingActive || view.samples === 0} onClick={record}>{recordingActive ? `Recording ${recordSeconds.toFixed(0)}/15 s…` : 'Record labelled take'}</button></div><p className="small-note">{source === 'phone' ? 'Raw phone readings are stored on this browser. Training sends the selected phone takes to your CabWise backend.' : 'Simulator takes are marked synthetic and excluded from phone-model training.'}</p><div className="record-counts">{ACTIVITIES.map(label => <span key={label}>{label}: <strong>{counts[label]}</strong> phone takes</span>)}</div><div className="motion-buttons"><button className="button neutral" disabled={!recordings.length} onClick={() => download('cabwise-motion-recordings.csv', recordingsCsv(recordings), 'text/csv;charset=utf-8')}><Download size={16}/>Export {recordings.length} takes as CSV</button><button className="button primary" disabled={!canTrain || training || running || source !== 'phone'} onClick={train}>{training ? 'Training…' : 'Train phone classifier'}</button></div><p className="small-note">Training holds out complete recordings before windowing. The raw data stays on this browser until exported or sent for training. No real phone accuracy is claimed until you collect and evaluate those takes.</p></section>
    <section className="model-panel"><p className="eyebrow">MODEL EVALUATION</p><h2>{source === 'simulation' ? 'Synthetic demo results' : 'Held-out phone recordings'}</h2><p>{modelMessage}</p>{model && <><p className="small-note">{model.report.limitation}</p><div className="model-summary"><span>Held-out window accuracy: <strong>{(model.report.accuracy * 100).toFixed(1)}%</strong></span><span>{model.report.train_recording_ids.length} training / {model.report.test_recording_ids.length} test recordings</span><span>{model.report.train_windows} training / {model.report.test_windows} test windows</span></div><div className="table-scroll"><table><thead><tr><th>Activity</th><th>Precision</th><th>Recall</th><th>F1</th><th>Test windows</th></tr></thead><tbody>{ACTIVITIES.map(label => { const row = model.report.per_class[label]; return <tr key={label}><td>{label}</td><td>{(row.precision * 100).toFixed(1)}%</td><td>{(row.recall * 100).toFixed(1)}%</td><td>{(row.f1 * 100).toFixed(1)}%</td><td>{row.windows}</td></tr>; })}</tbody></table></div><details className="motion-details"><summary>Split details and confusion matrix</summary><pre>{JSON.stringify(model.report, null, 2)}</pre></details></>}</section>
  </>;
}

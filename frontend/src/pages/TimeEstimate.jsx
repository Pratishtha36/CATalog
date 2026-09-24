import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { post } from '../lib/api';
import { useOperatorWorkspace } from './OperatorWorkspace';

export default function TimeEstimate() {
  const { operatorId, mutate, busy: saving } = useOperatorWorkspace(); const navigate = useNavigate();
  const [form, setForm] = useState({ task_type: 'trenching', weather: 'clear', estimated_time_min: 60 });
  const [result, setResult] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const requestId = useRef(null);
  useEffect(() => { setResult(null); requestId.current = null; }, [operatorId]);
  function update(key, value) { setForm({ ...form, [key]: value }); setResult(null); requestId.current = null; }
  async function predict(event) { event.preventDefault(); setBusy(true); setError(''); try { setResult(await post('/api/predict-time', { ...form, estimated_time_min: Number(form.estimated_time_min), operator_id: operatorId })); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  return <><p className="eyebrow">TIME ESTIMATE</p><h1>Plan with a range.</h1><p className="muted intro">A Gradient Boosting demonstration trained on 2,000 synthetic tasks. These are planning examples, not validated field predictions.</p>
    <section className="companion-card"><form onSubmit={predict}><fieldset disabled={busy} className="activity-fields"><label>Task type<select value={form.task_type} onChange={e => update('task_type', e.target.value)}>{['loading', 'grading', 'trenching', 'excavation', 'demolition'].map(t => <option key={t}>{t}</option>)}</select></label><label>Weather<select value={form.weather} onChange={e => update('weather', e.target.value)}>{['clear', 'rainy', 'windy'].map(w => <option key={w}>{w}</option>)}</select></label><label>Baseline minutes<input type="number" required min="5" max="240" value={form.estimated_time_min} onChange={e => update('estimated_time_min', e.target.value)}/></label><button className="button primary">{busy ? 'Estimating…' : 'Estimate task time'}</button></fieldset></form></section>
    {error && <p className="error-banner" role="alert">{error}</p>}{result && <section className="companion-card" aria-live="polite"><span className="badge">Synthetic-data model</span><h2>{result.predicted_minutes} minutes</h2><p>Planning range: <strong>{result.range_minutes.join('–')} minutes</strong></p><p>{result.interval_label}</p><p>{result.explanation}</p><h3>What the model uses</h3>{result.evaluation.factors.map(f => <label className="factor" key={f.name}>{f.name} · {(100 * f.importance).toFixed(1)}%<meter min="0" max="1" value={f.importance}/></label>)}<p className="small-note">{result.limitations}</p><details><summary>Held-out evaluation</summary><p>MAE: {result.evaluation.mae_minutes} minutes on {result.evaluation.test_rows} held-out synthetic rows. Interval coverage: {(result.evaluation.test_interval_coverage * 100).toFixed(1)}%. Separate training/calibration/test splits: 1200/400/400; fixed seed 42.</p></details>
    <button className="button primary" disabled={saving} onClick={async () => { requestId.current ||= crypto.randomUUID(); const ok = await mutate('/api/tasks', { ...form, estimated_time_min: result.predicted_minutes, location_name: 'Demo site · Model estimate', request_id: requestId.current }); if (ok) navigate('/'); }}>Add to My Day with this estimate</button><p className="small-note">Recorded operator skill comes from the profile. Passing a quiz does not change this estimate.</p></section>}
  </>;
}

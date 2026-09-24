import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { request } from '../lib/api';
import { useOperatorWorkspace } from './OperatorWorkspace';

const sources = [['demo_fixture', 'Historical demo fixture'], ['sample_replay', 'Seatbelt sample replay'], ['phone_estimate', 'Phone estimates'], ['simulation', 'Synthetic simulator']];

export default function Insights() {
  const { operatorId } = useOperatorWorkspace();
  const [source, setSource] = useState('demo_fixture');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null); setError('');
    request(`/api/insights?operator_id=${encodeURIComponent(operatorId)}&source=${source}`)
      .then(value => { if (active) setData(value); }).catch(failure => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [operatorId, source, revision]);
  return <><div className="page-heading"><div><p className="eyebrow">INSIGHTS</p><h1>Make the next shift better.</h1><p className="muted">Explainable observations, with the records behind every flag.</p></div><span className="badge">{operatorId} · Rules-based review</span></div>
    <section className="insight-controls"><label>Machine-log source<select value={source} onChange={event => setSource(event.target.value)}>{sources.map(([value, name]) => <option value={value} key={value}>{name}</option>)}</select></label><button className="button neutral" onClick={() => setRevision(revision + 1)}><RefreshCw size={16}/>Refresh insights</button><p className="small-note">Sources are evaluated separately. Completed-task overruns are shown independently for this operator. Thresholds are demo heuristics, not calibrated machine limits.</p></section>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {!data && !error && <p role="status">Loading insights…</p>}
    {data && <><div className="day-summary"><div><AlertTriangle/><strong>{data.flags.length}</strong><span>Flags to review</span></div><div><CheckCircle2/><strong>{data.log_count}</strong><span>Selected-source records</span></div><div><CheckCircle2/><strong>{data.completed_task_count}</strong><span>Completed tasks reviewed</span></div></div>
      <p className="small-note">Updated {new Date(data.generated_at).toLocaleString()}. {data.range_start ? `Machine records: ${new Date(data.range_start).toLocaleString()} to ${new Date(data.range_end).toLocaleString()}.` : 'No machine records for this source.'} Review includes at most 200 machine records and 100 completed tasks.</p>
      <section className="insight-coverage"><h2>Available measurements</h2><p className="small-note">Idle: {data.coverage.idle} records · Fuel per cycle: {data.coverage.fuel_per_cycle} records · Seatbelt: {data.coverage.seatbelt} records. Missing measurements are unknown; no flags does not mean the machine is safe.</p></section>
      <div className="insight-list">{data.flags.map(flag => <article className="insight-card" key={flag.id}><div className="section-heading"><h2>{flag.title}</h2><span className="badge">{flag.severity}</span></div><p>{flag.reason}</p><p className="small-note">{flag.action}</p><Link className="button secondary" to={`/training?source=${source}`}>Open CoachCard</Link><details className="motion-details"><summary>View supporting data</summary><pre>{JSON.stringify(flag.evidence, null, 2)}</pre></details></article>)}</div>
      {!data.flags.length && <section className="empty-panel"><CheckCircle2 size={36}/><h2>No threshold flags in these records.</h2><p>Review data coverage above. New observations appear after they have synced.</p></section>}</>}
  </>;
}

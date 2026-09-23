import { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, Save } from 'lucide-react';
import { post, request, apiUrl } from '../lib/api';
import { incidentStore as store, mergeReports, preparePhoto } from '../lib/incidentStore';
import { useOperatorWorkspace } from './OperatorWorkspace';

const names = { incident: 'Incident', near_miss: 'Near miss', unsafe_condition: 'Unsafe condition' };

export default function Incidents() {
  const { operatorId } = useOperatorWorkspace();
  const [type, setType] = useState('near_miss');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [converting, setConverting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [rows, setRows] = useState([]);
  const mounted = useRef(false);
  const saving = useRef(false);
  const fileRef = useRef(null);
  const photoVersion = useRef(0);
  const currentOperator = useRef(operatorId);
  currentOperator.current = operatorId;

  async function refresh(id = operatorId) {
    const local = await store.db.reports.where('operator_id').equals(id).toArray();
    let remote = (await store.db.cache.get(id))?.rows || [];
    if (mounted.current && currentOperator.current === id) setRows(mergeReports(local, remote));
    if (navigator.onLine) {
      try {
        remote = await request(`/api/incidents?operator_id=${encodeURIComponent(id)}`);
        await store.db.cache.put({ operator_id: id, rows: remote });
        if (mounted.current && currentOperator.current === id) setRows(mergeReports(await store.db.reports.where('operator_id').equals(id).toArray(), remote));
      } catch { /* Locally saved reports remain visible when the API is unavailable. */ }
    }
  }
  async function sync() {
    if (!navigator.onLine) { await refresh(); return; }
    if (mounted.current) setSyncing(true);
    try { await store.sync(payload => post('/api/incidents', payload)); await refresh(); }
    catch (failure) { if (mounted.current) setError(failure.message); }
    finally { if (mounted.current) setSyncing(false); }
  }
  useEffect(() => {
    mounted.current = true;
    store.db.open().then(() => { if (mounted.current) setReady(true); return sync(); }).catch(failure => setError(`Local storage unavailable: ${failure.message}`));
    const updated = () => { void refresh().catch(failure => mounted.current && setError(failure.message)); };
    window.addEventListener('catalog:incidents-updated', updated);
    return () => { mounted.current = false; photoVersion.current++; window.removeEventListener('catalog:incidents-updated', updated); };
  }, [operatorId]);
  useEffect(() => { setRows([]); setNote(''); setPhoto(null); setConverting(false); setMessage(''); setError(''); photoVersion.current++; if (fileRef.current) fileRef.current.value = ''; }, [operatorId]);

  async function choosePhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const version = ++photoVersion.current;
    setConverting(true); setPhoto(null); setError('');
    try { const value = await preparePhoto(file); if (mounted.current && version === photoVersion.current) setPhoto(value); }
    catch (failure) { if (mounted.current && version === photoVersion.current) setError(failure.message); }
    finally { if (mounted.current && version === photoVersion.current) setConverting(false); }
  }
  async function save(event) {
    event.preventDefault();
    if (saving.current || !ready || converting) return;
    saving.current = true; setBusy(true); setError('');
    const id = operatorId;
    try {
      await store.save({ client_id: crypto.randomUUID(), operator_id: id, machine_id: 'MC1001', type,
        note: note.trim(), photo, created_at: new Date().toISOString(), lat: null, lng: null });
      if (mounted.current && currentOperator.current === id) {
        setNote(''); setPhoto(null); if (fileRef.current) fileRef.current.value = '';
        setMessage('Report saved on this browser. It will sync when the backend is reachable.');
      }
      await refresh(id); void sync();
    } catch (failure) { if (mounted.current) setError(`Report was not saved: ${failure.message}`); }
    finally { saving.current = false; if (mounted.current) setBusy(false); }
  }
  return <><div className="page-heading"><div><p className="eyebrow">INCIDENT REPORTING</p><h1>Record it. Keep it visible.</h1><p className="muted">Save an incident, near miss, or unsafe condition, even when the connection drops.</p></div><span className="badge">{operatorId} · MC1001</span></div>
    <p className="small-note">Demo reports only. This app does not contact emergency services or dispatch a supervisor. Follow your site’s reporting process for urgent situations.</p>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {message && <p className="report-message" role="status">{message}</p>}
    <form className="incident-form" onSubmit={save}><fieldset disabled={busy || !ready}><label>Report type<select value={type} onChange={e => setType(e.target.value)}>{Object.entries(names).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label><label>What happened?<textarea required minLength={5} maxLength={2000} rows={5} value={note} onChange={e => setNote(e.target.value)} placeholder="Describe what you observed and where on the demo site it happened."/></label><label className="photo-picker"><span><Camera size={18}/>Optional photo</span><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={choosePhoto} disabled={converting}/></label>
      <p className="small-note">Photos are resized and saved with the report. No device location is collected. Only press Save when you are ready to send this report to the CATalog backend.</p>
      {photo && <div className="photo-preview"><img src={photo} alt="Photo attached to this report"/><button type="button" className="text-link" onClick={() => { setPhoto(null); if (fileRef.current) fileRef.current.value = ''; }}>Remove attached photo</button></div>}
      <button className="button primary" type="submit" disabled={converting || note.trim().length < 5}><Save size={18}/>{busy ? 'Saving…' : converting ? 'Preparing photo…' : 'Save report'}</button></fieldset></form>
    <div className="section-heading"><div><h2>Saved reports</h2><p className="small-note">{rows.filter(row => row.status === 'pending').length} pending on this browser. Server history shows the latest 50 reports; local reports remain available after refresh.</p></div><button className="button neutral" disabled={!ready || syncing} onClick={() => sync()}><RefreshCw size={16}/>{syncing ? 'Syncing…' : 'Sync now'}</button></div>
    <div className="incident-list">{rows.map(row => <article className="incident-card" key={row.client_id}><div className="section-heading"><h2>{names[row.type]}</h2><span className="badge">{row.status === 'synced' ? 'Synced' : 'Saved locally · Pending'}</span></div><p className="small-note">{new Date(row.created_at).toLocaleString()} · Operator report</p><p className="incident-note">{row.note}</p>{row.syncError && <p className="report-error">Sync pending: {row.syncError}</p>}{(row.photo || row.has_photo) && <details className="motion-details"><summary>View attached photo</summary><img className="incident-photo" loading="lazy" src={row.photo || apiUrl(`/api/incidents/${row.id}/photo`)} alt="Photo attached to the saved report"/></details>}</article>)}</div>
    {ready && !rows.length && <p className="small-note">No saved reports available on this browser yet.</p>}
  </>;
}

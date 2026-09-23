import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Activity, ArrowRight, CheckCircle2, Clock3, MapPin, ShieldCheck, Sun, Volume2 } from 'lucide-react';
import { post, request } from '../lib/api';
import { SAFETY_LANGUAGES, LANGUAGE_STORAGE_KEY, getSafetyLanguage } from '../lib/safetyAudio';
import audioManifest from '../lib/safetyAudioManifest.json';
import { createSafetyAudioPlayer } from '../lib/safetyAudioPlayer';

const Workspace = createContext(null);
const names = { pending: 'Ready to start', in_progress: 'In progress', completed: 'Completed' };
const timeLabel = value => value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
const duration = minutes => minutes < 1 ? `${Math.round(minutes * 60)} sec` : `${minutes.toFixed(1)} min`;

export function WorkspaceProvider({ children }) {
  const [operators, setOperators] = useState([]);
  const [operatorId, setOperatorId] = useState('OP1001');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [languageCode, setLanguageCode] = useState(() => {
    try { return getSafetyLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY)).code; }
    catch { return 'hi-IN'; }
  });
  const language = getSafetyLanguage(languageCode);
  const [voiceMessage, setVoiceMessage] = useState('Safety audio is off until you enable it.');
  const busyRef = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(false);
  const lastAlert = useRef(null);
  const playerRef = useRef(null);
  if (!playerRef.current) {
    playerRef.current = createSafetyAudioPlayer({ onError: message => {
      if (mounted.current) {
        setAudioEnabled(false);
        setVoiceMessage(`${message} Visual alerts remain available.`);
      }
    } });
  }

  async function refresh(id = operatorId) {
    const version = ++generation.current;
    try {
      const query = `?operator_id=${encodeURIComponent(id)}`;
      const [people, tasks, shift, safety] = await Promise.all([
        request('/api/operators'), request(`/api/tasks/today${query}`),
        request(`/api/shifts/current${query}`), request(`/api/safety/status${query}`),
      ]);
      if (!mounted.current || version !== generation.current) return;
      setOperators(people);
      setData({ ...tasks, ...shift, safety });
      setError('');
    } catch (failure) {
      if (mounted.current && version === generation.current) setError(failure.message);
    }
  }

  useEffect(() => {
    mounted.current = true;
    refresh(operatorId);
    const interval = setInterval(() => { if (!busyRef.current) refresh(operatorId); }, 10000);
    return () => { mounted.current = false; generation.current++; clearInterval(interval); };
  }, [operatorId]);

  useEffect(() => () => playerRef.current.stop(), []);

  async function speak(prompt) {
    const clip = audioManifest[language.code]?.[prompt];
    if (!clip) {
      setAudioEnabled(false);
      setVoiceMessage('This audio clip is missing. Visual alerts remain available.');
      return 'failed';
    }
    const result = await playerRef.current.play(clip.url);
    if (result === 'started' && mounted.current) {
      setVoiceMessage(`${language.name} safety audio enabled. Playing the bundled recording.`);
    }
    return result;
  }

  function selectLanguage(code) {
    const next = getSafetyLanguage(code);
    playerRef.current.stop();
    setLanguageCode(next.code);
    setAudioEnabled(false);
    lastAlert.current = null;
    setVoiceMessage(`${next.name} selected. Enable audio to hear a sample and turn on alerts.`);
    try { localStorage.setItem(LANGUAGE_STORAGE_KEY, next.code); } catch { /* Session selection still works. */ }
  }

  async function enableAudio() {
    const unsafe = data?.safety.seatbelt_status === 'unfastened';
    const result = await speak(unsafe ? 'seatbelt' : 'greeting');
    if (result === 'cancelled' || !mounted.current) return;
    if (result === 'started' && unsafe) lastAlert.current = `${language.code}:${data.safety.log_id}`;
    setAudioEnabled(result === 'started');
  }

  useEffect(() => {
    if (!data?.shift || !audioEnabled) return;
    const alertKey = `${language.code}:${data.safety.log_id}`;
    if (data.safety.seatbelt_status === 'unfastened' && lastAlert.current !== alertKey) {
      lastAlert.current = alertKey;
      void speak('seatbelt');
    }
  }, [data?.safety.log_id, data?.shift?.id, audioEnabled, language.code]);

  async function mutate(path, extra = {}) {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    generation.current++;
    try {
      await post(path, { operator_id: operatorId, ...extra });
      await refresh();
      return true;
    } catch (failure) {
      if (mounted.current) setError(failure.message);
      return false;
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  function selectOperator(id) {
    generation.current++;
    setData(null);
    setError('');
    lastAlert.current = null;
    playerRef.current.stop();
    setAudioEnabled(false);
    setOperatorId(id);
  }

  return <Workspace.Provider value={{ data, operators, operatorId, selectOperator, refresh, error, busy, mutate,
    enableAudio, audioEnabled, voiceMessage, language, selectLanguage }}>{children}</Workspace.Provider>;
}

function ErrorBanner() {
  const { error, refresh, busy } = useContext(Workspace);
  if (!error) return null;
  return <div className="error-banner" role="alert"><p>{error}</p><button className="button secondary" disabled={busy} onClick={() => refresh()}>Refresh saved state</button></div>;
}

function ShiftPanel() {
  const { data, operators, operatorId, selectOperator, mutate, busy, error, enableAudio, audioEnabled, voiceMessage, language, selectLanguage } = useContext(Workspace);
  return <section className="shift-controls">
    <div><label htmlFor="operator">Demo operator</label><select id="operator" value={operatorId} disabled={busy} onChange={event => selectOperator(event.target.value)}>
      {operators.length ? operators.map(operator => <option key={operator.operator_id} value={operator.operator_id}>{operator.name} · {operator.operator_id}</option>) : <option value="OP1001">OP1001</option>}
    </select><p className="small-note">Demo selection, not an authenticated login.</p></div>
    <div className="shift-actions"><label htmlFor="safety-language">Safety audio language</label>
      <select id="safety-language" value={language.code} onChange={event => selectLanguage(event.target.value)}>
        {SAFETY_LANGUAGES.map(item => <option key={item.code} value={item.code}>{item.nativeName} / {item.name}</option>)}
      </select>
      <p className="small-note">{`${language.name} audio is included. No voice installation needed.`}</p>
      {data?.shift ? <span className="shift-started"><CheckCircle2 size={18}/> Shift started at {timeLabel(data.shift.started_at)}</span> : <button className="button primary" disabled={!data || busy || !!error} onClick={() => { enableAudio(); mutate('/api/shifts/start'); }}>शिफ्ट शुरू करें · Start shift</button>}
      {data?.shift && <button className="button secondary" onClick={enableAudio}><Volume2 size={16}/>{audioEnabled ? `Check ${language.name} audio` : `Enable ${language.name} audio`}</button>}
      <p className="small-note" role="status">{voiceMessage}</p>
    </div>
  </section>;
}

export function SafetyCard({ controls = false }) {
  const { data, mutate, busy, error, language } = useContext(Workspace);
  if (!data) return null;
  const status = data.safety.seatbelt_status;
  const danger = status === 'unfastened';
  return <section className={`safety-card ${danger ? 'warning' : ''}`}>
    <div className="section-heading"><h2><ShieldCheck size={20}/> Seatbelt check</h2><span className="badge">{data.safety.data_source === 'sample_replay' ? 'Sample replay' : 'Demo fixture'} · Not live</span></div>
    <p className="seatbelt-value" role="status">{danger ? <><span lang={language.code}>{language.seatbelt}</span>{language.code !== 'en-IN' && <span lang="en"> / Please fasten your seatbelt.</span>}</> : status === 'fastened' ? 'Sample status: fastened' : 'Seatbelt status unknown'}</p>
    <p className="small-note">This is a recorded sample, not a sensor reading from your machine. {data.safety.timestamp && `Recorded ${new Date(data.safety.timestamp).toLocaleString()}.`}</p>
    {controls ? <div className="replay-controls"><button className="button secondary" disabled={busy || !!error || !data.shift || danger} onClick={() => mutate('/api/safety/replay', { seatbelt_status: 'unfastened' })}>Replay unfastened sample</button><button className="button neutral" disabled={busy || !!error || !data.shift || status === 'fastened'} onClick={() => mutate('/api/safety/replay', { seatbelt_status: 'fastened' })}>Replay fastened sample</button>{!data.shift && <p className="small-note">Start your shift to use sample replay.</p>}</div> : <Link className="text-link" to="/safety">Open safety and replay a sample</Link>}
  </section>;
}

export function MyDay() {
  const { data, error, busy, mutate, refresh } = useContext(Workspace);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const completed = data?.tasks.filter(task => task.status === 'completed').length || 0;
  const active = data?.tasks.find(task => task.status === 'in_progress');
  return <><div className="page-heading"><div><p className="eyebrow">YOUR OPERATOR COMPANION</p><h1>Your day. One task at a time.</h1><p className="muted">Namaste. Start your shift, review the work, and record your progress.</p></div><span className="badge">Demo worksite · {data?.date || 'Loading'}</span></div>
    <ErrorBanner/><ShiftPanel/>
    {!data && !error && <p role="status" className="muted">Loading your saved shift and tasks…</p>}
    {data && <><div className="day-summary"><div><Sun size={21}/><strong>{data.tasks.length}</strong><span>Assigned tasks</span></div><div><Activity size={21}/><strong>{active ? '1' : '0'}</strong><span>In progress</span></div><div><CheckCircle2 size={21}/><strong>{completed}/{data.tasks.length}</strong><span>Completed</span></div></div>
    <div className="section-heading"><h2>Today’s work</h2><button className="text-link" disabled={busy} onClick={() => refresh()}>Refresh</button></div>
    {!data.tasks.length && <section className="shift-panel"><p>No tasks assigned for today.</p></section>}
    <div className="task-list">{data.tasks.map((task, index) => <article className={`task-card ${task.status}`} key={task.task_id}><div className="task-number">{String(index + 1).padStart(2, '0')}</div><div className="task-body"><div className="task-title"><h2>{task.task_type}</h2><span className={`badge status-${task.status}`}>{names[task.status]}</span></div><p className="task-location"><MapPin size={14}/>{task.location_name}</p><div className="task-meta"><span><Clock3 size={14}/> {task.estimated_time_min} min estimate</span><span>{task.machine_id} · CAT 320D</span><span>{task.weather} · {task.data_source.replaceAll('_', ' ')}</span></div>
      {task.status === 'in_progress' && <p className="task-timing">Started {timeLabel(task.started_at)} · {duration(Math.max(0, (now - Date.parse(task.started_at)) / 60000))} elapsed{task.scheduled_date !== data.date ? ' · Carried over from a previous day' : ''}</p>}
      {task.status === 'completed' && <p className="task-timing">{timeLabel(task.started_at)}–{timeLabel(task.finished_at)} · Actual time {duration(task.actual_time_min)}</p>}
      {task.pre_dig_acknowledged_at && <p className="small-note">Demo pre-dig acknowledgement recorded.</p>}
      <div className="task-actions">{task.status === 'pending' && (['trenching', 'excavation'].includes(task.task_type) ? <Link aria-disabled={!data.shift || !!active || busy || !!error} className={`button primary ${!data.shift || active || busy || error ? 'disabled-link' : ''}`} to={`/dig-safe?task=${encodeURIComponent(task.task_id)}`}>Review pre-dig check <ArrowRight size={16}/></Link> : <button className="button primary" disabled={!data.shift || !!active || busy || !!error} onClick={() => mutate(`/api/tasks/${task.task_id}/start`)}>Start task <ArrowRight size={16}/></button>)}
      {task.status === 'in_progress' && <button className="button secondary" disabled={busy || !!error} onClick={() => mutate(`/api/tasks/${task.task_id}/finish`)}>Finish task <CheckCircle2 size={16}/></button>}
      {task.status === 'pending' && (!data.shift || active) && <span className="small-note">{!data.shift ? 'Start your shift first.' : 'Finish the active task first.'}</span>}
      </div></div></article>)}</div><SafetyCard/></>}
    <p className="footnote">Tasks and timings are saved to the backend. Offline task updates arrive in a later milestone.</p><Link className="text-link" to="/device-check">Check phone sensors and Hindi audio</Link>
  </>;
}

export function SafetyPage() {
  return <><p className="eyebrow">BASIC SAFETY</p><h1>Make the check part of your shift.</h1><p className="muted intro">Replay a sample seatbelt status to see the alert flow. This demo has no live machine connection.</p><ErrorBanner/><ShiftPanel/><SafetyCard controls/><section className="shift-panel"><ShieldCheck size={24}/><div><h3>Pre-dig review</h3><p>Trenching tasks open a demo acknowledgement before they can start. Utility mapping and incident capture are planned for later steps.</p><Link className="text-link" to="/">Review today’s tasks</Link></div></section></>;
}

export function PreDigPage() {
  const { data, busy, error, mutate } = useContext(Workspace);
  const [params] = useSearchParams();
  const [acknowledged, setAcknowledged] = useState(false);
  const taskId = params.get('task');
  const task = data?.tasks.find(item => item.task_id === taskId);
  const active = data?.tasks.some(item => item.status === 'in_progress');
  useEffect(() => setAcknowledged(false), [taskId]);
  return <><p className="eyebrow">DIGSAFE · DEMO PRE-DIG REVIEW</p><h1>Pause before the first dig.</h1><p className="muted intro">This step records a demo acknowledgement. Utility data and proximity checks are not connected yet.</p><ErrorBanner/><section className="pre-dig-panel"><ShieldCheck size={36}/><h2>No utility clearance is available</h2><p>The app has not checked underground utilities, bucket clearance, or site conditions. Completing this screen does not establish that excavation is safe.</p>
    {!data && !error && <p role="status">Loading task…</p>}
    {task?.status === 'pending' && ['trenching', 'excavation'].includes(task.task_type) ? <><p><strong>{task.task_type}</strong> · {task.location_name}</p><label className="acknowledgement"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)}/>I understand this is a demo workflow and does not provide utility clearance.</label><button className="button primary" disabled={!acknowledged || !data.shift || active || busy || !!error} onClick={() => mutate(`/api/tasks/${task.task_id}/start`, { pre_dig_acknowledged: true })}>Acknowledge and start demo task <ArrowRight size={16}/></button>{!data.shift && <p className="small-note">Start your shift from My Day first.</p>}{active && <p className="small-note">Finish your active task before starting this one.</p>}</> : <p>{task ? `This task is ${names[task.status]?.toLowerCase()}.` : 'Select a trenching task from My Day to open its pre-dig review.'}</p>}
    <Link className="text-link" to="/">Back to My Day</Link></section></>;
}

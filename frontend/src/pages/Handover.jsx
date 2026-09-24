import { useEffect, useState } from 'react';
import { request } from '../lib/api';
import { speakHindi, stopVoice } from '../lib/voice';
import { useOperatorWorkspace } from './OperatorWorkspace';

export default function Handover() {
  const { operatorId } = useOperatorWorkspace(); const [data, setData] = useState(null), [message, setMessage] = useState('');
  async function load() { try { setData(await request(`/api/handover?operator_id=${operatorId}`)); setMessage(''); } catch (e) { setMessage(e.message); } }
  useEffect(() => { load(); return stopVoice; }, [operatorId]);
  return <><p className="eyebrow">SHIFT HANDOVER</p><h1>Leave the next team informed.</h1><p className="muted intro">A summary of saved records, not an official shift sign-off.</p><button className="button secondary" onClick={load}>Refresh summary</button>{message && <p role="status">{message}</p>}{data && <section className="companion-card"><p className="small-note">As of {new Date(data.generated_at).toLocaleString()}</p><div className="day-summary"><div><strong>{data.completed_tasks}</strong><span>Completed</span></div><div><strong>{data.active_tasks}</strong><span>Active</span></div><div><strong>{data.pending_tasks}</strong><span>Pending</span></div></div><p>Fuel remaining: unknown. {data.fault_status}.</p><p lang="hi">{data.script_hi}</p><button className="button primary" onClick={async () => { try { setMessage(await speakHindi(data.script_hi)); } catch (e) { setMessage(e.message); } }}>Play Hindi handover</button><button className="button secondary" onClick={stopVoice}>Stop</button><h2>Today’s reports</h2>{data.incidents.map(i => <p key={i.id}>{i.type}: {i.note}</p>)}{!data.incidents.length && <p>No reports recorded today.</p>}</section>}</>;
}

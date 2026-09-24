import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { request, post } from '../lib/api';
import { offlineStore } from '../lib/offlineStore';
import { speakHindi, stopVoice } from '../lib/voice';
import { useOperatorWorkspace } from './OperatorWorkspace';

function LessonCard({ lesson, operatorId, reload }) {
  const [answers, setAnswers] = useState({}), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [result, setResult] = useState(null);
  async function play(text, fallback) { try { setMessage(await speakHindi(text, fallback)); } catch (e) { setMessage(e.message); } }
  async function submit(event) {
    event.preventDefault(); setBusy(true);
    const payload = { request_id: crypto.randomUUID(), operator_id: operatorId, answers: [0, 1, 2].map(i => Number(answers[i])) };
    const path = `/api/training/${lesson.id}/complete`;
    try {
      await offlineStore.saveQuiz(path, payload);
      if (navigator.onLine) await offlineStore.sync(async (url, body) => { const value = await post(url, body); if (body.request_id === payload.request_id) setResult(value); return value; });
      setMessage('Answers saved on this device. Pending answers sync when connected; grading is done by the server.'); await reload();
    } catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  }
  return <article className="companion-card"><div className="section-heading"><h2>{lesson.title}</h2><span className="badge">{lesson.generation_source.replaceAll('_', ' ')}</span></div>
    <p>{lesson.evidence.reason}</p><p className="small-note">{lesson.generation_source === 'gemini_draft' ? 'AI-generated learning draft. Check operational guidance with your supervisor.' : 'Fixed Hindi topic guidance selected from the supporting evidence.'} Best quiz score: {lesson.best_score === null ? 'Not completed' : `${lesson.best_score}%`}.</p>
    <div className="task-actions"><button className="button primary" onClick={() => play(lesson.script_hi, lesson.audio_url)}>Play Hindi lesson</button><button className="button secondary" onClick={stopVoice}>Stop audio</button></div>
    <details><summary>Hindi transcript and evidence</summary><p lang="hi">{lesson.script_hi}</p><pre>{JSON.stringify(lesson.evidence.values, null, 2)}</pre></details>
    <form onSubmit={submit}><fieldset disabled={busy} className="quiz-fields"><legend>Three-question learning check</legend>{lesson.quiz.map((question, index) => <fieldset key={index}><legend>{index + 1}. {question.question}<br/><span lang="hi">{question.question_hi}</span></legend><button type="button" className="text-link" onClick={() => play(`${question.question_hi} ${question.options.join('। ')}`, lesson.generation_source === 'gemini_draft' ? null : `/audio/coach/${lesson.trigger}-quiz-${index}.mp3`)}>Listen to question</button>{question.options.map((option, choice) => <label className="quiz-choice" key={choice}><input required type="radio" name={`${lesson.id}-${index}`} value={choice} checked={answers[index] === choice} onChange={() => { setAnswers({ ...answers, [index]: choice }); setResult(null); }}/>{option}</label>)}</fieldset>)}<button className="button primary" disabled={Object.keys(answers).length !== 3}>Save answers</button></fieldset></form>
    {message && <p role="status">{message}</p>}{result && <p role="status"><strong>{result.score}% · {result.passed ? 'Learning check passed' : 'Review and try again'}</strong> Correct options: {result.correct_answers.map(i => i + 1).join(', ')}.</p>}
  </article>;
}

export default function Training() {
  const { operatorId } = useOperatorWorkspace(); const [params] = useSearchParams();
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [cached, setCached] = useState(false);
  const [source, setSource] = useState(params.get('source') || 'demo_fixture');
  async function load() {
    try { const value = await request(`/api/training/assigned?operator_id=${operatorId}`); setData(value); setCached(false); await offlineStore.db.lessons.put({ operator_id: operatorId, ...value }); }
    catch (e) { const value = await offlineStore.db.lessons.get(operatorId); if (value) { setData(value); setCached(true); } else setError(e.message); }
  }
  useEffect(() => { setData(null); load(); return stopVoice; }, [operatorId]);
  async function generate() {
    setBusy(true); setError('');
    try { const value = await post('/api/training/generate', { operator_id: operatorId, source }, { timeoutMs: 55000 }); setData(value); setCached(false); await offlineStore.db.lessons.put({ operator_id: operatorId, ...value }); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <><p className="eyebrow">COACHCARD</p><h1>One lesson. A better next shift.</h1><p className="muted intro">Hindi coaching linked to your records, with a short learning check. {cached && 'Showing cached lessons.'}</p>
    <section className="companion-card"><label>Evidence source<select value={source} onChange={e => setSource(e.target.value)}>{['demo_fixture', 'sample_replay', 'phone_estimate', 'simulation'].map(s => <option key={s}>{s}</option>)}</select></label><button className="button primary" disabled={busy} onClick={generate}>{busy ? 'Preparing lessons…' : 'Generate lessons from my insights'}</button>{data && <p>{data.passed_lessons} lessons passed · {data.training_level}. {data.notice}</p>}</section>
    {data?.generation_notice && <p role="status">{data.generation_notice}</p>}{data && !data.ai_configured && <p className="small-note">AI is not configured. Cached Hindi template lessons remain available; set GEMINI_API_KEY on the backend to enable AI generation.</p>}{error && <p role="alert" className="error-banner">{error}</p>}{!data && !error && <p role="status">Loading lessons…</p>}
    {data?.lessons.map(lesson => <LessonCard key={`${operatorId}-${lesson.id}`} lesson={lesson} operatorId={operatorId} reload={load}/>)}
    {data && !data.lessons.length && <section className="companion-card">No lessons assigned yet. Generate a lesson after an insight or a near-miss in the sample utility area is recorded.</section>}
  </>;
}

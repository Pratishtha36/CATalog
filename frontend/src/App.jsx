import { useEffect, useRef, useState } from 'react';
import { NavLink, Link, Routes, Route } from 'react-router-dom';
import { Sun, Activity, ShieldCheck, Lightbulb, BookOpen, ArrowUpRight, ArrowRight, Wrench, LayoutDashboard, Smartphone, MapPin, Volume2, CheckCircle2, Radio, HardHat } from 'lucide-react';
import { checkHealth } from './lib/api';
import Live from './pages/Live';
import { WorkspaceProvider, MyDay, SafetyPage, PreDigPage } from './pages/OperatorWorkspace';

const navigation = [
  ['/', 'My Day', Sun], ['/live', 'SwingSense', Activity], ['/safety', 'Safety', ShieldCheck],
  ['/insights', 'Insights', Lightbulb], ['/training', 'Training', BookOpen],
];
const modules = {
  '/insights': ['Insights', 'Understand your working day.', 'See the numbers behind idle time, task overruns, and fuel consumption.', 'Performance insights will appear once machine logs are connected.', Lightbulb],
  '/training': ['CoachCard', 'Small lessons. Better habits.', 'Personalised Hindi audio lessons based on your recent work, followed by a short quiz.', 'Lessons and training progress arrive in a later milestone.', BookOpen],
  '/estimate': ['Time estimate', 'Plan the next task.', 'Task duration estimates using task type, weather, machine age, and recorded operator skill.', 'The prediction model is not connected yet.', Sun],
  '/dashboard': ['Supervisor', 'Your site, at a glance.', 'Task progress, recent alerts, incidents, and training completion.', 'Fleet totals will appear when operator data is connected.', LayoutDashboard],
};

function BackendStatus() {
  const [state, setState] = useState('Checking connection');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let active = true;
    setState('Checking connection');
    checkHealth(controller.signal).then(() => active && setState('Backend connected'))
      .catch(() => active && setState('Backend unavailable'));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [attempt]);
  return <button className="connection" onClick={() => setAttempt(attempt + 1)} title="Retry backend connection"><span className={`dot ${state === 'Backend connected' ? 'good' : ''}`} />{state}</button>;
}

function Module({ config }) {
  const [title, heading, description, note, Icon] = config;
  return <><p className="eyebrow">{title.toUpperCase()}</p><h1>{heading}</h1><p className="muted intro">{description}</p><section className="empty-panel"><span className="icon-tile large"><Icon size={34}/></span><span className="badge">Planned module</span><h2>Taking shape, one step at a time.</h2><p>{note}</p><Link className="button primary" to="/device-check">Check phone capabilities <ArrowRight size={17}/></Link>{title === 'Safety' && <Link className="text-link" to="/dig-safe">Explore DigSafe</Link>}</section></>;
}

function DeviceCheck() {
  const [motion, setMotion] = useState('Not checked');
  const [sample, setSample] = useState(null);
  const [location, setLocation] = useState('Not checked');
  const [voice, setVoice] = useState('Not checked');
  const [voices, setVoices] = useState([]);
  const stopRef = useRef(() => {});
  const alive = useRef(true);
  const geoRequest = useRef(0);
  useEffect(() => {
    alive.current = true;
    const update = () => setVoices(window.speechSynthesis?.getVoices() || []);
    update();
    window.speechSynthesis?.addEventListener('voiceschanged', update);
    return () => { alive.current = false; geoRequest.current++; stopRef.current(); window.speechSynthesis?.removeEventListener('voiceschanged', update); window.speechSynthesis?.cancel(); };
  }, []);
  async function startMotion() {
    stopRef.current(); setSample(null);
    if (!window.isSecureContext) return setMotion('HTTPS required on your phone');
    if (!window.DeviceMotionEvent) return setMotion('Motion API unavailable');
    try {
      if (typeof DeviceMotionEvent.requestPermission === 'function') {
        const permission = await DeviceMotionEvent.requestPermission();
        if (!alive.current) return;
        if (permission !== 'granted') return setMotion('Permission denied. Allow motion access in browser settings.');
      }
      if (!alive.current) return;
      setMotion('Listening — gently move your phone');
      let received = false; let last = 0;
      const handler = event => {
        const value = event.accelerationIncludingGravity || event.acceleration;
        if (!value || !['x', 'y', 'z'].some(axis => Number.isFinite(value[axis]))) return;
        received = true;
        if (Date.now() - last < 150) return;
        last = Date.now();
        setMotion('Motion data received');
        setSample(['x', 'y', 'z'].map(axis => `${axis.toUpperCase()} ${Number.isFinite(value[axis]) ? value[axis].toFixed(2) : '—'}`).join(' · '));
      };
      window.addEventListener('devicemotion', handler);
      const timeout = setTimeout(() => { if (!received) { setMotion('No readings received. Check permissions or use a supported phone.'); stopRef.current(); } }, 8000);
      stopRef.current = () => { window.removeEventListener('devicemotion', handler); clearTimeout(timeout); };
    } catch (error) { if (alive.current) setMotion(`Motion unavailable: ${error.message}`); }
  }
  function checkLocation() {
    if (!window.isSecureContext) return setLocation('HTTPS required on your phone');
    if (!navigator.geolocation) return setLocation('Geolocation unavailable');
    setLocation('Waiting for location permission…');
    const request = ++geoRequest.current;
    navigator.geolocation.getCurrentPosition(position => {
      if (alive.current && request === geoRequest.current) setLocation(`${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)} · accuracy ±${Math.round(position.coords.accuracy)} m`);
    }, error => { if (alive.current && request === geoRequest.current) setLocation(`Location unavailable: ${error.message}`); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }
  function playHindi() {
    if (!window.speechSynthesis) return setVoice('Speech synthesis unavailable');
    const hindiVoice = voices.find(item => item.lang.toLowerCase().startsWith('hi'));
    if (!hindiVoice) return setVoice('No Hindi voice found. Install a Hindi system voice and retry; recorded audio is planned as a fallback.');
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance('नमस्ते! कैबवाइज़ में आपका स्वागत है। कृपया सीट बेल्ट लगाएँ।');
    utterance.lang = 'hi-IN'; utterance.voice = hindiVoice;
    utterance.onend = () => alive.current && setVoice('Playback finished — confirm that you heard Hindi clearly.');
    utterance.onerror = event => alive.current && setVoice(`Playback failed: ${event.error}`);
    setVoice(`Playing with ${hindiVoice.name}`);
    window.speechSynthesis.speak(utterance);
  }
  return <><p className="eyebrow">DEVICE READINESS</p><h1>Meet your phone.</h1><p className="muted intro">Run these checks on the phone you’ll use in the cab. Access is requested only when you tap a check.</p><div className={`context-banner ${window.isSecureContext ? 'secure' : ''}`}><ShieldCheck size={20}/><div><strong>{window.isSecureContext ? 'Secure browser context' : 'A secure connection is needed'}</strong><p>{window.isSecureContext ? 'This page can request supported device capabilities.' : 'Use an HTTPS deployment for phone sensors and location. A local network HTTP address is not enough.'}</p></div></div><div className="check-grid">{[
    [Activity, 'Motion sensors', 'Check accelerometer access before building SwingSense.', motion, startMotion, 'Check motion'],
    [MapPin, 'Location', 'Get one position and its accuracy. Nothing is uploaded.', location, checkLocation, 'Check location'],
    [Volume2, 'Hindi audio', 'Play a short Hindi greeting using a voice on this device.', voice, playHindi, 'Play Hindi greeting'],
  ].map(([Icon, title, description, status, action, label]) => <section className="check-card" key={title}><span className="icon-tile"><Icon size={24}/></span><h2>{title}</h2><p>{description}</p><div className="check-result" role="status">{status}</div>{title === 'Motion sensors' && sample && <code>{sample} m/s²</code>}<button className="button secondary" onClick={action}>{label}<ArrowUpRight size={17}/></button>{title === 'Motion sensors' && <button className="text-link" onClick={() => { stopRef.current(); setMotion('Stopped'); }}>Stop listening</button>}</section>)}</div><div className="shift-panel"><CheckCircle2 size={24}/><div><h3>What this check tells us</h3><p>Sensor access is a first step. It does not establish machine activity accuracy or safety readiness. Hindi playback and offline voice availability need a real-phone check.</p></div></div></>;
}

export default function App() {
  return <WorkspaceProvider><div className="app-shell"><aside className="sidebar"><Link to="/" className="brand"><span className="brand-mark"><HardHat size={26}/></span>CabWise<span className="brand-period">.</span></Link><div className="workspace-label">OPERATOR WORKSPACE</div><nav aria-label="Main navigation">{navigation.map(([url, title, Icon]) => <NavLink key={url} to={url} end={url === '/'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Icon size={20}/><span>{title}</span></NavLink>)}</nav><div className="sidebar-bottom"><NavLink className="nav-item" to="/device-check"><Smartphone size={20}/><span>Device check</span></NavLink><NavLink className="nav-item" to="/estimate"><Wrench size={20}/><span>Time estimate</span></NavLink><NavLink className="nav-item" to="/dashboard"><LayoutDashboard size={20}/><span>Supervisor view</span></NavLink><div className="sidebar-note"><Radio size={18}/><p>Made for the machines<br/>that still have work to do.</p></div></div></aside><div className="main-shell"><header className="topbar"><span className="topbar-label">WORK SMARTER. EVERY SHIFT.</span><BackendStatus/><span className="avatar" aria-label="Demo operator">OP</span></header><main><Routes><Route path="/" element={<MyDay/>}/><Route path="/live" element={<Live/>}/><Route path="/safety" element={<SafetyPage/>}/><Route path="/dig-safe" element={<PreDigPage/>}/><Route path="/device-check" element={<DeviceCheck/>}/>{Object.entries(modules).map(([url, config]) => <Route key={url} path={url} element={<Module config={config}/>}/>)}<Route path="*" element={<><h1>Page not found</h1><Link className="button primary" to="/">Return to My Day</Link></>}/></Routes></main></div></div></WorkspaceProvider>;
}

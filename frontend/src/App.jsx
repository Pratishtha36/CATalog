import { useEffect, useRef, useState } from 'react';
import { NavLink, Link, Routes, Route } from 'react-router-dom';
import { Sun, Activity, ShieldCheck, Lightbulb, BookOpen, ArrowUpRight, ArrowRight, Wrench, LayoutDashboard, Smartphone, MapPin, Volume2, CheckCircle2, Radio, HardHat } from 'lucide-react';
import { checkHealth } from './lib/api';

const navigation = [
  ['/', 'My Day', Sun], ['/live', 'SwingSense', Activity], ['/safety', 'Safety', ShieldCheck],
  ['/insights', 'Insights', Lightbulb], ['/training', 'Training', BookOpen],
];
const modules = {
  '/live': ['SwingSense', 'A little motion. A clearer picture.', 'Phone motion will help estimate machine activity, idle time, and work cycles.', 'Sensor classification arrives in the next milestone. You can check sensor access now.', Activity],
  '/safety': ['Safety', 'Start with a safer shift.', 'Seatbelt alerts, mapped utility warnings, and incident reporting in one place.', 'Safety readings and incident capture are not connected yet.', ShieldCheck],
  '/insights': ['Insights', 'Understand your working day.', 'See the numbers behind idle time, task overruns, and fuel consumption.', 'Performance insights will appear once machine logs are connected.', Lightbulb],
  '/training': ['CoachCard', 'Small lessons. Better habits.', 'Personalised Hindi audio lessons based on your recent work, followed by a short quiz.', 'Lessons and training progress arrive in a later milestone.', BookOpen],
  '/dig-safe': ['DigSafe', 'Know what is mapped below.', 'Location-based warnings around mapped underground utilities.', 'Utility mapping is planned. This prototype does not detect buried cables or control machinery.', MapPin],
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

function Home() {
  return <>
    <div className="page-heading"><div><p className="eyebrow">YOUR OPERATOR COMPANION</p><h1>A good day starts here.</h1><p className="muted">Namaste, operator. Let’s get ready for the shift.</p></div><span className="badge"><span className="dot" /> Foundation preview</span></div>
    <section className="hero"><div className="hero-content"><span className="hero-tag"><HardHat size={15} /> BUILT FOR THE CAB</span><h2>Your machine.<br />Your phone.<br /><span>Your companion.</span></h2><p>A simpler way to plan work, stay aware, and learn a little every day. Even on an older machine.</p><Link className="button primary" to="/device-check">Check your phone <ArrowUpRight size={18} /></Link></div><div className="machine-art" aria-hidden="true"><svg viewBox="0 0 420 300"><defs><pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M 28 0 L 0 0 0 28" fill="none" stroke="#ffffff" strokeOpacity=".07" /></pattern></defs><rect width="420" height="300" fill="url(#grid)"/><circle cx="226" cy="150" r="106" fill="none" stroke="#f8b900" strokeOpacity=".18"/><path d="M52 256H390" stroke="#6e746e"/><rect x="75" y="224" width="177" height="32" rx="16" fill="#343c37" stroke="#a0a79b" strokeWidth="2"/><path d="M92 240H233" stroke="#a0a79b" strokeWidth="4" strokeDasharray="9 6"/><path d="M89 213V180H159V142H214L238 191V221H93Z" fill="#f8b900"/><path d="M171 153H205L222 187H171Z" fill="#1c2a26"/><path d="M218 183L268 74L307 69L361 185" fill="none" stroke="#f8b900" strokeWidth="22" strokeLinejoin="round"/><path d="M237 163L276 83M311 94L344 165" stroke="#abb4ac" strokeWidth="5"/><path d="M345 179L370 183L389 220L349 222L333 202Z" fill="#f8b900"/><circle cx="267" cy="77" r="7" fill="#1c2a26"/><path d="M98 190H147M98 198H147" stroke="#1c2a26" strokeWidth="4"/></svg><span className="art-caption"><span className="dot good" /> One phone. More possibilities.</span></div></section>
    <div className="section-heading"><h2>Ready for what’s next</h2><span>Three tools. One companion.</span></div>
    <div className="feature-grid">{[['/live', '01', 'SwingSense', 'Turn movement into a view of your working day.', Activity], ['/dig-safe', '02', 'DigSafe', 'Stay aware of mapped utilities around your work.', ShieldCheck], ['/training', '03', 'CoachCard', 'Learn from your own work, one Hindi lesson at a time.', BookOpen]].map(([url, number, title, description, Icon]) => <Link className="feature-card" to={url} key={url}><div className="flex items-center justify-between"><span className="icon-tile"><Icon size={22}/></span><span className="number">{number}</span></div><h3>{title}</h3><p>{description}</p><span className="card-link">Explore module <ArrowRight size={16}/></span></Link>)}</div>
    <section className="shift-panel"><div className="icon-tile"><Sun size={24}/></div><div><h3>Your task list is next</h3><p>Tasks, start and finish tracking, and shift progress will appear here once connected.</p></div><span className="badge">Coming next</span></section>
    <p className="footnote">Hackathon prototype · Preview screens contain no live machine or safety readings.</p>
  </>;
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
  return <div className="app-shell"><aside className="sidebar"><Link to="/" className="brand"><span className="brand-mark"><HardHat size={26}/></span>CabWise<span className="brand-period">.</span></Link><div className="workspace-label">OPERATOR WORKSPACE</div><nav aria-label="Main navigation">{navigation.map(([url, title, Icon]) => <NavLink key={url} to={url} end={url === '/'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Icon size={20}/><span>{title}</span></NavLink>)}</nav><div className="sidebar-bottom"><NavLink className="nav-item" to="/device-check"><Smartphone size={20}/><span>Device check</span></NavLink><NavLink className="nav-item" to="/estimate"><Wrench size={20}/><span>Time estimate</span></NavLink><NavLink className="nav-item" to="/dashboard"><LayoutDashboard size={20}/><span>Supervisor view</span></NavLink><div className="sidebar-note"><Radio size={18}/><p>Made for the machines<br/>that still have work to do.</p></div></div></aside><div className="main-shell"><header className="topbar"><span className="topbar-label">WORK SMARTER. EVERY SHIFT.</span><BackendStatus/><span className="avatar" aria-label="Demo operator">OP</span></header><main><Routes><Route path="/" element={<Home/>}/><Route path="/device-check" element={<DeviceCheck/>}/>{Object.entries(modules).map(([url, config]) => <Route key={url} path={url} element={<Module config={config}/>}/>)}<Route path="*" element={<><h1>Page not found</h1><Link className="button primary" to="/">Return to My Day</Link></>}/></Routes></main></div></div>;
}

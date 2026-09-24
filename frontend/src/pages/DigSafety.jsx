import { useEffect, useRef, useState } from 'react';
import { request } from '../lib/api';
import { offlineStore } from '../lib/offlineStore';
import { SITE, metres, coordinates, nearestUtility, proximityLevel } from '../lib/geo';
import { speakHindi, stopVoice } from '../lib/voice';
import { useOperatorWorkspace } from './OperatorWorkspace';

export default function DigSafety() {
  const { operatorId } = useOperatorWorkspace();
  const [features, setFeatures] = useState([]), [point, setPoint] = useState(coordinates([35, 0]));
  const [mode, setMode] = useState('simulation'), [accuracy, setAccuracy] = useState(null), [error, setError] = useState('');
  const [audio, setAudio] = useState(false), [updated, setUpdated] = useState(null), [now, setNow] = useState(Date.now());
  const watch = useRef(null), last = useRef('');
  useEffect(() => {
    let active = true;
    request(`/api/utilities/near?lat=${SITE[1]}&lng=${SITE[0]}`).then(value => active && setFeatures(value.features)).catch(async () => {
      const pack = await offlineStore.db.packs.get(operatorId);
      if (active) { setFeatures(pack?.utilities?.features || []); if (!pack) setError('No utility sample is cached. Connect once to download it.'); }
    });
    return () => { active = false; };
  }, [operatorId]);
  useEffect(() => { const tick = setInterval(() => setNow(Date.now()), 1000); return () => { clearInterval(tick); if (watch.current !== null) navigator.geolocation?.clearWatch(watch.current); stopVoice(); }; }, []);
  const nearest = nearestUtility(point, features);
  const uncertain = mode === 'gps' && (!updated || now - updated > 15000 || accuracy > 10);
  const level = !nearest ? 'unknown' : uncertain ? 'uncertain' : proximityLevel(nearest.distance);
  useEffect(() => {
    if (last.current === level) return;
    last.current = level;
    if (audio && ['caution', 'warning', 'stop'].includes(level)) {
      speakHindi('सावधान। नमूना नक्शे में उपयोगिता पास है। साइट की अधिकृत सुरक्षा प्रक्रिया अपनाएँ।', '/audio/coach/utility-alert.mp3').catch(e => setError(e.message));
    }
  }, [level, audio]);
  function simulate() { if (watch.current !== null) navigator.geolocation?.clearWatch(watch.current); watch.current = null; setMode('simulation'); setAccuracy(null); setPoint(coordinates([35, 0])); setError(''); }
  function locate() {
    if (!window.isSecureContext || !navigator.geolocation) return setError('GPS requires HTTPS and a location-capable browser.');
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    setMode('gps'); setUpdated(null); setError('Waiting for location permission…');
    watch.current = navigator.geolocation.watchPosition(value => {
      setPoint([value.coords.longitude, value.coords.latitude]); setAccuracy(value.coords.accuracy); setUpdated(Date.now()); setError('');
    }, failure => { setUpdated(null); setError(failure.message); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  }
  function move(event) {
    if (mode !== 'simulation') return;
    const rect = event.currentTarget.getBoundingClientRect();
    setPoint(coordinates([(event.clientX - rect.left) / rect.width * 120 - 60, 90 - (event.clientY - rect.top) / rect.height * 180]));
  }
  const [x, y] = metres(point);
  return <section className="companion-card"><div className="section-heading"><h2>DigSafe sample utility map</h2><span className="badge">{mode === 'simulation' ? 'Simulated position' : 'Phone GPS'} · Synthetic lines</span></div>
    <p>No underground detection, bucket tracking, depth setting or excavation clearance. Absence of a line does not establish safety.</p>
    <div className="task-actions"><button className="button secondary" onClick={simulate}>Simulate position</button><button className="button secondary" onClick={locate}>Use phone GPS</button><button className="button secondary" onClick={async () => { try { await speakHindi('नमूना नक्शे की चेतावनी चालू है।', '/audio/coach/utility-alert.mp3'); setAudio(true); } catch (e) { setError(e.message); } }}>Enable Hindi warning</button></div>
    <svg className="utility-map" viewBox="-60 -90 120 180" preserveAspectRatio="none" role="img" aria-label="Sample utility plan, metres relative to the demo site. Yellow dot is the selected position." onPointerDown={e => { if (mode === 'simulation') { e.currentTarget.setPointerCapture(e.pointerId); move(e); } }} onPointerMove={e => { if (e.buttons) move(e); }}>
      {features.map(feature => <polyline key={feature.id} points={feature.geometry.coordinates.map(pair => { const [a, b] = metres(pair); return `${a},${-b}`; }).join(' ')} fill="none" stroke={feature.properties.type === 'fibre' ? '#aa4b00' : '#23678a'} strokeWidth="2"/>)}
      <circle cx={Math.max(-58, Math.min(58, x))} cy={Math.max(-88, Math.min(88, -y))} r="3" fill="#f6bf00" stroke="#242424" strokeWidth="1"/>
    </svg><p className="small-note">120 m × 180 m local plan · Brown: fibre · Blue: water. An off-map GPS position is drawn at the edge.</p>
    {mode === 'simulation' && <label>Move east/west of the fibre line: {x.toFixed(1)} m<input type="range" min="-50" max="50" step="1" value={x} onChange={e => setPoint(coordinates([Number(e.target.value), 0]))}/></label>}
    <div className={`proximity-status ${level}`} role="status"><strong>{level === 'outside' ? 'Outside the sample alert zones; clearance remains unknown' : `${level.toUpperCase()} · sample proximity`}</strong><p>{nearest ? `${nearest.distance.toFixed(1)} m to the nearest sample line. Demo alert zones: 20 / 10 / 5 m.` : 'No sample utility data is available.'} {mode === 'gps' && `GPS accuracy ±${accuracy?.toFixed(0) || '?'} m. ${uncertain ? 'Location is stale or too imprecise for these alert zones.' : ''}`}</p></div>
    {error && <p role="alert">{error}</p>}
  </section>;
}

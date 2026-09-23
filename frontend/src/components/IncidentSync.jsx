import { useEffect } from 'react';
import { post } from '../lib/api';
import { incidentStore } from '../lib/incidentStore';

// Remains mounted across routes, so a saved report can sync after leaving its form.
export default function IncidentSync() {
  useEffect(() => {
    let active = true;
    async function sync() {
      if (!navigator.onLine || !active) return;
      try {
        const count = await incidentStore.sync(payload => post('/api/incidents', payload));
        if (active && count) window.dispatchEvent(new Event('catalog:incidents-updated'));
      } catch { /* The report screen displays storage failures and per-report errors. */ }
    }
    void sync();
    const timer = setInterval(sync, 15000);
    window.addEventListener('online', sync);
    return () => { active = false; clearInterval(timer); window.removeEventListener('online', sync); };
  }, []);
  return null;
}

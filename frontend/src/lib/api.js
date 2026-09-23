const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export async function checkHealth(signal) {
  const response = await fetch(`${base}/api/health`, { signal });
  if (!response.ok) throw new Error(`Backend returned ${response.status}`);
  const body = await response.json();
  if (body.status !== 'ok' || body.service !== 'cabwise-api') throw new Error('Unexpected backend response');
  return body;
}

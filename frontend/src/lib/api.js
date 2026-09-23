const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
export const apiUrl = path => `${base}${path}`;

export async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${base}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
      signal: options.signal || controller.signal,
    });
    const body = await response.json();
    if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : Array.isArray(body.detail) ? body.detail.slice(0, 3).map(item => item.msg).join('; ') : `Request failed (${response.status})`);
    return body;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The request timed out. Refresh to check the saved state before trying again.');
    if (error instanceof TypeError) throw new Error('Cannot reach the backend. Check your connection and refresh to confirm the saved state.');
    throw error;
  } finally { clearTimeout(timeout); }
}

export async function checkHealth(signal) {
  const body = await request('/api/health', { signal });
  if (body.status !== 'ok' || body.service !== 'catalog-api') throw new Error('Unexpected backend response');
  return body;
}

export const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) });

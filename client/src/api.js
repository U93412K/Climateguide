const API_BASE = import.meta.env.VITE_API_URL || '';

const KEY = 'cg_token';
export const tokenStore = {
  get() { try { return localStorage.getItem(KEY); } catch { return null; } },
  set(t) { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { /* storage unavailable */ } },
};

export class ApiError extends Error {
  constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

async function request(method, path, body) {
  const token = tokenStore.get();
  let res;
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      method,
      headers: { ...(body !== undefined && { 'content-type': 'application/json' }), ...(token && { authorization: `Bearer ${token}` }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the ClimateGuide server. Check that the backend is running.');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data.error || {};
    if (res.status === 401 && token) onUnauthorized();
    throw new ApiError(res.status, e.code || 'ERROR', e.message || `Request failed (${res.status})`, e.details);
  }
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b = {}) => request('POST', p, b),
  put: (p, b) => request('PUT', p, b),
  patch: (p, b) => request('PATCH', p, b),
  del: (p) => request('DELETE', p),
};

export const fmt = (n) => (n === null || n === undefined ? 'n/a' : Number(n).toLocaleString('en-IN'));
export const UNITS = { food: 'kg', water: 'L', medicine: 'kits' };
export const RESOURCES = ['food', 'water', 'medicine'];
export const dt = (d) => (d ? new Date(d).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '');

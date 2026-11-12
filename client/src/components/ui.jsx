import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api.js';

export const LEVEL_LABEL = { high: 'High risk', medium: 'Medium risk', low: 'Low risk', unavailable: 'Unavailable' };

export function RiskBadge({ level }) {
  return <span className={`badge lvl-${level}`}>{LEVEL_LABEL[level] || level}</span>;
}

export const Status = ({ value, label }) => <span className={`badge st-${value}`}>{label ?? String(value).replace('_', ' ')}</span>;

/** Vertical water gauge: fill height = risk score, tick marks at the medium/high thresholds. */
export function Gauge({ score, level, thresholds = { medium: 0.3, high: 0.55 } }) {
  const pct = score == null ? 0 : Math.round(score * 100);
  return (
    <div className={`gauge lvl-${level}`} role="img" aria-label={score == null ? 'Risk score unavailable' : `Risk score ${pct} out of 100`}>
      {score == null ? <span className="gauge-na">n/a</span> : <div className="gauge-fill" style={{ height: `${Math.max(4, pct)}%` }} />}
      <i className="tick" style={{ bottom: `${thresholds.medium * 100}%` }} />
      <i className="tick" style={{ bottom: `${thresholds.high * 100}%` }} />
    </div>
  );
}

export function ErrorBox({ error, children }) {
  if (!error) return null;
  return (
    <div className="alert error" role="alert">
      <p>{error.message || String(error)}</p>
      {error instanceof ApiError && error.code === 'NETWORK' && <p className="small">Start the API with <code>npm run dev</code> in <code>server/</code>.</p>}
      {children}
    </div>
  );
}

export const Notice = ({ kind = 'info', children }) => <div className={`alert ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>;

export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const run = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try { setState({ data: await fn(), error: null, loading: false }); }
    catch (error) { setState({ data: null, error, loading: false }); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run };
}

export function Loading({ label = 'Loading…' }) { return <p className="loading" role="status">{label}</p>; }

export function Field({ label, hint, children }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async (fn) => {
    setBusy(true); setError(null);
    try { return await fn(); } catch (e) { setError(e); return undefined; } finally { setBusy(false); }
  };
  return { busy, error, run, setError };
}

import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ErrorBox, Field, Notice, useAction, useAsync } from '../components/ui.jsx';

export const TYPES = [['flooding', 'Flooding'], ['road_closure', 'Road closed or impassable'], ['landslide', 'Landslide'], ['bridge_damage', 'Bridge damaged'], ['other', 'Other disruption']];

/** Used by the public page and by staff. Free text is optional and must not contain personal details. */
export function ReportForm({ onDone }) {
  const { isStaff } = useAuth();
  const regions = useAsync(() => api.get('/public/regions'), []);
  const segs = useAsync(() => api.get('/public/road-segments'), []);
  const [f, setF] = useState({ type: 'flooding', regionCode: '', edgeCode: '', severity: 3, description: '' });
  const [result, setResult] = useState(null);
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      const body = { ...f, severity: Number(f.severity), edgeCode: f.edgeCode || null };
      const r = await api.post(isStaff ? '/reports' : '/public/reports', body);
      setResult(r);
      setF({ ...f, description: '' });
      onDone?.();
    });
  };

  return (
    <form className="panel form" onSubmit={submit}>
      <Field label="What are you reporting?"><select value={f.type} onChange={set('type')}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
      <Field label="District">
        <select required value={f.regionCode} onChange={set('regionCode')}>
          <option value="">Select a district…</option>
          {(regions.data?.regions || []).map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
        </select>
      </Field>
      <Field label={f.type === 'road_closure' ? 'Road segment (required)' : 'Road segment (if relevant)'}>
        <select required={f.type === 'road_closure'} value={f.edgeCode} onChange={set('edgeCode')}>
          <option value="">None / not sure</option>
          {(segs.data?.segments || []).map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
        </select>
      </Field>
      <Field label={`Severity: ${f.severity} of 5`} hint="1 is minor, 5 is life-threatening or fully blocked."><input type="range" min="1" max="5" value={f.severity} onChange={set('severity')} /></Field>
      <Field label="Details (optional)" hint="Do not include names, phone numbers or exact home addresses."><textarea maxLength={280} rows={3} value={f.description} onChange={set('description')} /></Field>
      <ErrorBox error={error} />
      {result && <Notice kind={result.duplicate ? 'warn' : 'success'}>{result.message || (result.duplicate ? 'A matching report already exists; yours was merged into it.' : 'Report recorded.')}</Notice>}
      <button className="btn primary" disabled={busy}>{busy ? 'Sending…' : 'Send report'}</button>
    </form>
  );
}

export default function ReportIncident() {
  return (
    <div className="narrow">
      <h1>Report an incident</h1>
      <Notice kind="warn"><strong>In immediate danger?</strong> Call your local emergency number first. This form is reviewed by coordinators and is not monitored in real time.</Notice>
      <ReportForm />
    </div>
  );
}

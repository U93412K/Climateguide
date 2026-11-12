import { useEffect, useState } from 'react';
import { api, dt } from '../api.js';
import { ErrorBox, Field, Loading, Notice, useAction, useAsync } from '../components/ui.jsx';

export default function Settings() {
  const a = useAsync(() => api.get('/settings/assumptions'), []);
  const audit = useAsync(() => api.get('/audit'), []);
  const [f, setF] = useState(null);
  const [saved, setSaved] = useState(false);
  const act = useAction();
  useEffect(() => { if (a.data) setF(a.data.assumptions); }, [a.data]);
  if (a.loading || !f) return <Loading />;

  const num = (path) => (e) => {
    const next = structuredClone(f);
    const keys = path.split('.');
    keys.slice(0, -1).reduce((o, k) => o[k], next)[keys.at(-1)] = e.target.value;
    setF(next); setSaved(false);
  };
  const save = (e) => { e.preventDefault(); act.run(async () => { const r = await api.put('/settings/assumptions', f); setF(r.assumptions); setSaved(true); audit.reload(); }); };
  const I = (label, path, hint, step = 'any') => <Field label={label} hint={hint}><input type="number" step={step} required value={path.split('.').reduce((o, k) => o[k], f)} onChange={num(path)} /></Field>;

  return (
    <>
      <header className="page-head"><div><h1>Planning assumptions</h1><p className="lede">These values drive every estimate. They are assumptions, not measurements: review them against your agency's standards.</p></div></header>
      <form className="panel form" onSubmit={save}>
        <div className="grid3">
          {I('Food per person per day (kg)', 'foodKgPerPersonPerDay')}
          {I('Water per person per day (L)', 'waterLPerPersonPerDay')}
          {I('Medicine kits per person', 'medicineKitsPerPerson', '0.02 = one kit per 50 people')}
          {I('Planning period (days)', 'planningDays', 'Set to 1 for per-day figures', '1')}
          {I('Impact rate, medium risk', 'impactRate.medium', 'Share of flood-exposed people who need help')}
          {I('Impact rate, high risk', 'impactRate.high')}
          {I('Uncertainty band', 'uncertainty', '0.4 = plus or minus 40%')}
          {I('Medium risk threshold', 'riskThresholds.medium', 'Score from 0 to 1')}
          {I('High risk threshold', 'riskThresholds.high')}
          {I('Max supplier radius (km)', 'maxSupplierRadiusKm')}
          {I('Stale stock after (days)', 'staleSupplierDays', '', '1')}
          {I('Duplicate report window (hours)', 'dedupeWindowHours')}
        </div>
        <ErrorBox error={act.error} />
        {saved && <Notice kind="success">Assumptions saved. New plans will use them; existing plans keep the values they were built with.</Notice>}
        <div className="row"><button className="btn primary" disabled={act.busy}>Save assumptions</button><button type="button" className="btn" onClick={() => { setF(a.data.defaults); setSaved(false); }}>Load defaults</button></div>
      </form>
      <section className="panel"><h2>Audit log</h2>
        {audit.loading ? <Loading /> : <ErrorBox error={audit.error} />}
        {audit.data && <table className="table compact"><thead><tr><th>When</th><th>Who</th><th>Action</th></tr></thead>
          <tbody>{audit.data.entries.map((e) => <tr key={e.id}><td>{dt(e.at)}</td><td>{e.user?.name} <span className="muted small">({e.user?.role})</span></td><td>{e.action}</td></tr>)}</tbody></table>}
        {audit.data && !audit.data.entries.length && <p className="muted">No activity recorded yet.</p>}
      </section>
    </>
  );
}

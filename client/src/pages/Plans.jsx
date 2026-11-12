import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, dt, fmt } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ErrorBox, Field, Loading, Notice, Status, useAction, useAsync } from '../components/ui.jsx';

export default function Plans() {
  const { can } = useAuth();
  const nav = useNavigate();
  const plans = useAsync(() => api.get('/plans'), []);
  const regions = useAsync(() => api.get('/public/regions'), []);
  const cfg = useAsync(() => api.get('/public/config'), []);
  const [f, setF] = useState({ title: '', weatherSource: 'sample', scenario: 'heavy-rain', regionCodes: [] });
  const { busy, error, run } = useAction();

  const create = (e) => {
    e.preventDefault();
    run(async () => {
      const body = { ...f, title: f.title || undefined, regionCodes: f.regionCodes.length ? f.regionCodes : undefined };
      const r = await api.post('/plans', body);
      nav(`/plans/${r.plan.id}`);
    });
  };
  const byState = (regions.data?.regions || []).reduce((a, r) => ({ ...a, [r.state]: [...(a[r.state] || []), r] }), {});
  const toggleState = (list) => {
    const codes = list.map((r) => r.code);
    const all = codes.every((c) => f.regionCodes.includes(c));
    setF({ ...f, regionCodes: all ? f.regionCodes.filter((c) => !codes.includes(c)) : [...new Set([...f.regionCodes, ...codes])] });
  };
  const toggle = (c) => setF({ ...f, regionCodes: f.regionCodes.includes(c) ? f.regionCodes.filter((x) => x !== c) : [...f.regionCodes, c] });

  return (
    <>
      <header className="page-head"><div><h1>Response plans</h1><p className="lede">Each plan chains risk, affected population, demand, supplier matching and routing. Plans start as drafts: nothing is dispatched until an authorised person approves.</p></div></header>

      {can('admin', 'coordinator', 'logistics') && (
        <form className="panel form" onSubmit={create}>
          <h2>Generate a new plan</h2>
          <div className="grid2">
            <Field label="Plan title (optional)"><input maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Brahmaputra flood response" /></Field>
            <Field label="Weather data">
              <select value={f.weatherSource} onChange={(e) => setF({ ...f, weatherSource: e.target.value })}>
                <option value="sample">Sample scenario (demo)</option>
                <option value="live" disabled={cfg.data && !cfg.data.liveWeatherAvailable}>Live OpenWeather{cfg.data && !cfg.data.liveWeatherAvailable ? ' (no API key set)' : ''}</option>
              </select>
            </Field>
            {f.weatherSource === 'sample' && (
              <Field label="Scenario"><select value={f.scenario} onChange={(e) => setF({ ...f, scenario: e.target.value })}>{(cfg.data?.scenarios || []).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field>
            )}
          </div>
          <fieldset><legend>Regions <span className="muted small">(none selected = all districts; click a state name to select all of its districts)</span></legend>
            {Object.entries(byState).map(([st, list]) => (
              <div key={st} className="state-group">
                <button type="button" className="link" onClick={() => toggleState(list)}>{st}</button>
                <div className="chips">{list.map((r) => (
                  <label key={r.code} className={`chip ${f.regionCodes.includes(r.code) ? 'on' : ''}`}><input type="checkbox" checked={f.regionCodes.includes(r.code)} onChange={() => toggle(r.code)} />{r.name}</label>
                ))}</div>
              </div>
            ))}
          </fieldset>
          <ErrorBox error={error}>
            {error?.details?.canFallbackToSample && <button type="button" className="btn" onClick={() => setF({ ...f, weatherSource: 'sample' })}>Switch to sample data</button>}
          </ErrorBox>
          <button className="btn primary" disabled={busy}>{busy ? 'Running the pipeline…' : 'Generate draft plan'}</button>
        </form>
      )}

      <section className="panel">
        <h2>All plans</h2>
        {plans.loading ? <Loading /> : <ErrorBox error={plans.error} />}
        {plans.data && !plans.data.plans.length && <p className="muted">No plans yet. Generate the first one above.</p>}
        {!!plans.data?.plans.length && (
          <table className="table"><thead><tr><th>Plan</th><th>Status</th><th>High / medium</th><th>People (est.)</th><th>Deliveries</th><th>Unresolved</th><th>Created</th></tr></thead>
            <tbody>{plans.data.plans.map((p) => (
              <tr key={p.id}>
                <td><Link to={`/plans/${p.id}`}><strong>{p.title}</strong></Link><br /><span className="small muted">{p.number}</span></td>
                <td><Status value={p.status} /></td>
                <td>{p.headline?.high} / {p.headline?.medium}</td><td>{fmt(p.headline?.affectedExpected)}</td><td>{p.headline?.deliveries}</td>
                <td>{p.headline?.unresolved ? <span className="warn-text">{p.headline.unresolved}</span> : 0}</td>
                <td>{dt(p.createdAt)}<br /><span className="small muted">{p.createdBy?.name}</span></td>
              </tr>))}</tbody></table>
        )}
      </section>
      {!can('admin', 'coordinator', 'logistics') && <Notice>Your role has read-only access to plans.</Notice>}
    </>
  );
}

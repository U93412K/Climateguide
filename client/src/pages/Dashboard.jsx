import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, dt } from '../api.js';
import { useAuth } from '../auth.jsx';
import MapView from '../components/MapView.jsx';
import { ErrorBox, Gauge, Loading, Notice, RiskBadge, useAsync } from '../components/ui.jsx';

export default function Dashboard() {
  const { isStaff } = useAuth();
  const cfg = useAsync(() => api.get('/public/config'), []);
  const regions = useAsync(() => api.get('/public/regions'), []);
  const [source, setSource] = useState('sample');
  const [scenario, setScenario] = useState('heavy-rain');
  const [stateSel, setStateSel] = useState('all');
  const states = [...new Set((regions.data?.regions || []).map((r) => r.state))].sort();
  const stateCodes = stateSel === 'all' ? '' : (regions.data?.regions || []).filter((r) => r.state === stateSel).map((r) => r.code).join(',');
  const risk = useAsync(() => api.get(`/public/risk?source=${source}&scenario=${scenario}${stateCodes ? `&regions=${stateCodes}` : ''}`), [source, scenario, stateCodes]);
  const reports = useAsync(() => api.get('/public/reports'), []);
  const [staffData, setStaffData] = useState({ suppliers: [], roads: null });

  useEffect(() => {
    if (!isStaff) { setStaffData({ suppliers: [], roads: null }); return; }
    Promise.all([api.get('/suppliers'), api.get('/roads')])
      .then(([s, roads]) => setStaffData({ suppliers: s.suppliers, roads }))
      .catch(() => setStaffData({ suppliers: [], roads: null }));
  }, [isStaff]);

  useEffect(() => {
    if (cfg.data && !cfg.data.liveWeatherAvailable && source === 'live') setSource('sample');
  }, [cfg.data, source]);

  const risks = risk.data?.risks || [];
  const counts = ['high', 'medium', 'low', 'unavailable'].map((l) => [l, risks.filter((r) => r.level === l).length]);
  const canFallback = risk.error?.details?.canFallbackToSample;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Natural disaster risk across the monitored districts</h1>
          <p className="lede">Estimated flood and extreme-rainfall risk from forecast rainfall and local terrain. Estimates only: follow official local authority advice.</p>
        </div>
        <div className="controls" role="group" aria-label="Weather data">
          <label className="field inline"><span>Weather data</span>
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="sample">Sample scenarios (demo)</option>
              <option value="live" disabled={!cfg.data?.liveWeatherAvailable}>Live OpenWeather{cfg.data && !cfg.data.liveWeatherAvailable ? ' (no API key set)' : ''}</option>
            </select>
          </label>
          <label className="field inline"><span>State</span>
            <select value={stateSel} onChange={(e) => setStateSel(e.target.value)}>
              <option value="all">All states ({regions.data?.regions.length ?? '…'} districts)</option>
              {states.map((st) => <option key={st} value={st}>{st}</option>)}
            </select>
          </label>
          {source === 'sample' && (
            <label className="field inline"><span>Scenario</span>
              <select value={scenario} onChange={(e) => setScenario(e.target.value)}>
                {(cfg.data?.scenarios || [{ id: 'heavy-rain', label: 'Heavy rainfall' }]).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
          )}
        </div>
      </header>

      {source === 'live' && stateSel === 'all' && <Notice kind="warn">Live data for all states makes about two OpenWeather calls per district. The free plan allows 60 calls per minute, so pick a state if you see rate-limit errors.</Notice>}
      {source === 'sample' && <Notice>You are viewing <strong>sample weather data</strong>, not a real forecast.</Notice>}
      <ErrorBox error={risk.error}>{canFallback && <button className="btn" onClick={() => setSource('sample')}>Switch to sample data</button>}</ErrorBox>

      <section className="summary" aria-label="Risk summary">
        {counts.map(([l, n]) => <div key={l} className={`stat lvl-${l}`}><strong>{n}</strong><span>{l === 'unavailable' ? 'data unavailable' : `${l} risk`}</span></div>)}
      </section>

      <div className="split">
        <section className="panel flush" aria-label="Map">
          <MapView risks={risks} regions={stateSel === 'all' ? [] : (regions.data?.regions || []).filter((r) => r.state === stateSel)} suppliers={staffData.suppliers} roads={staffData.roads} height={520} />
          <p className="map-legend small">Circles: region risk (red high, amber medium, green low, grey unavailable). White dots: settlements (shown when one state is selected).{isStaff && ' Blue dots: suppliers. Lines: road network (dashed red = closed).'}</p>
        </section>

        <section className="panel" aria-label="Regions">
          <h2>Regions</h2>
          {risk.loading && <Loading label="Fetching weather and calculating risk…" />}
          {!risk.loading && !risks.length && !risk.error && <p className="muted">No regions to show.</p>}
          <ul className="region-list region-scroll">
            {risks.map((r) => (
              <li key={r.regionCode}>
                <Gauge score={r.score} level={r.level} />
                <div>
                  <h3>{r.name} <RiskBadge level={r.level} /></h3>
                  <p className="small muted">{r.state}{r.weather ? ` · ${r.weather.condition}, ${r.weather.temperatureC ?? '?'}°C, humidity ${r.weather.humidity ?? '?'}%` : ''}</p>
                  {r.weather?.rain24h != null && <p className="small">Forecast rain: {r.weather.rain24h} mm / 24 h{r.weather.rain72h != null ? `, ${r.weather.rain72h} mm / 72 h` : ''}</p>}
                  {r.incomplete && <p className="small warn-text">Incomplete data: {r.level === 'unavailable' ? 'no risk level shown.' : 'estimate may understate the risk.'}</p>}
                  <details><summary>Why this level?</summary><ul className="plain">{r.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul></details>
                </div>
              </li>
            ))}
          </ul>
          {risk.data && <p className="small muted">{risk.data.meta.disclaimer} Updated {dt(risk.data.meta.generatedAt)}.</p>}
        </section>
      </div>

      <section className="panel">
        <div className="row-between"><h2>Active ground reports</h2><Link className="btn" to="/report">Report an incident</Link></div>
        {reports.loading ? <Loading /> : !reports.data?.reports.length ? <p className="muted">No active reports.</p> : (
          <table className="table"><thead><tr><th>Type</th><th>Region</th><th>Severity</th><th>Reported</th><th>Reports merged</th></tr></thead>
            <tbody>{reports.data.reports.map((r) => <tr key={r.id}><td>{r.type.replace('_', ' ')}</td><td>{r.regionCode}</td><td>{r.severity}/5</td><td>{dt(r.reportedAt)}</td><td>{r.reportCount}</td></tr>)}</tbody></table>
        )}
      </section>
    </>
  );
}

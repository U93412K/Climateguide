import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, dt, fmt, RESOURCES, UNITS } from '../api.js';
import { useAuth } from '../auth.jsx';
import MapView from '../components/MapView.jsx';
import { ErrorBox, Gauge, Loading, Notice, RiskBadge, Status, useAction, useAsync } from '../components/ui.jsx';

const TABS = ['Overview', 'Risk', 'Affected and demand', 'Suppliers and routes', 'Approval and delivery'];
const NEXT = { planned: ['dispatched', 'cancelled'], dispatched: ['in_transit', 'failed'], in_transit: ['delivered', 'failed'] };
const items = (i) => RESOURCES.map((r) => `${fmt(i[r])} ${UNITS[r]} ${r}`).join(', ');

export default function PlanDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { can } = useAuth();
  const { data, error, loading, reload } = useAsync(() => api.get(`/plans/${id}`), [id]);
  const [tab, setTab] = useState(0);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const plan = data.plan;
  const res = plan.result;

  return (
    <>
      <header className="page-head">
        <div>
          <p className="crumb"><button className="link" onClick={() => nav('/plans')}>Response plans</button> / {plan.number}</p>
          <h1>{plan.title} <Status value={plan.status} /></h1>
          <p className="lede">Generated {dt(plan.createdAt)} by {plan.createdBy?.name}. {res.meta.weatherSource === 'sample' ? <strong>Sample weather data, not a real forecast.</strong> : 'Live forecast data.'}</p>
        </div>
      </header>
      <p className="disclaimer">{res.meta.disclaimer}</p>
      <div className="tabs" role="tablist">
        {TABS.map((t, i) => <button key={t} role="tab" aria-selected={tab === i} className={tab === i ? 'on' : ''} onClick={() => setTab(i)}>{t}</button>)}
      </div>
      {tab === 0 && <Overview plan={plan} setTab={setTab} />}
      {tab === 1 && <RiskTab res={res} />}
      {tab === 2 && <DemandTab res={res} />}
      {tab === 3 && <LogisticsTab res={res} />}
      {tab === 4 && <ApprovalTab plan={plan} reload={reload} can={can} />}
    </>
  );
}

function Overview({ plan, setTab }) {
  const res = plan.result;
  const t = res.totals;
  const critical = res.warnings.filter((w) => w.level === 'critical');
  return (
    <>
      <section className="panel">
        <h2>Briefing {res.narrative.source === 'ai' && <span className="badge st-in_progress">AI-written</span>}</h2>
        <p className="prose">{res.narrative.text}</p>
        {res.narrative.note && <p className="small muted">{res.narrative.note}</p>}
      </section>
      <section className="summary">
        <div className="stat"><strong>{fmt(t.affectedExpected)}</strong><span>people may need help (range {fmt(t.affectedMin)} to {fmt(t.affectedMax)})</span></div>
        {RESOURCES.map((r) => <div className="stat" key={r}><strong>{fmt(t.shortage[r])}</strong><span>{UNITS[r]} {r} short after local stock</span></div>)}
        <div className={`stat ${res.unresolved.length ? 'lvl-high' : ''}`}><strong>{res.unresolved.length}</strong><span>unresolved shortage lines</span></div>
      </section>
      <section className="panel">
        <h2>Warnings ({res.warnings.length})</h2>
        {!res.warnings.length && <p className="muted">No warnings.</p>}
        <ul className="warnings">{[...res.warnings].sort((a, b) => ['critical', 'warning', 'info'].indexOf(a.level) - ['critical', 'warning', 'info'].indexOf(b.level)).map((w, i) => <li key={i} className={`w-${w.level}`}><b>{w.level}</b> {w.message}</li>)}</ul>
      </section>
      <section className="panel">
        <h2>Delivery priorities</h2>
        {!res.priorities.length ? <p className="muted">No regions need relief deliveries.</p> : (
          <ol className="plain">{res.priorities.map((p) => <li key={p.regionCode}><strong>{p.name}</strong> <RiskBadge level={p.riskLevel} /> <span className="muted small">priority score {p.score}</span></li>)}</ol>
        )}
      </section>
      {plan.status === 'draft' && <Notice kind="warn">This plan is a draft. {critical.length ? `${critical.length} critical warning(s) must be acknowledged. ` : ''}<button className="link" onClick={() => setTab(4)}>Go to approval</button></Notice>}
      <section className="panel"><h2>How this plan was built</h2>
        <ul className="plain">{res.stages.map((s) => <li key={s.agent}><b>{s.agent}</b> <Status value={s.status === 'completed' ? 'delivered' : 'failed'} label={s.status} /> {s.summary}</li>)}</ul>
        <p className="small muted">All figures come from deterministic calculations. The optional AI model only rewrites the briefing text and never changes numbers.</p>
      </section>
    </>
  );
}

function RiskTab({ res }) {
  return (
    <>
      <section className="panel flush"><MapView risks={res.risks} height={380} /></section>
      <section className="panel"><h2>Predicted risk by region</h2>
        <ul className="region-list">{res.risks.map((r) => (
          <li key={r.regionCode}><Gauge score={r.score} level={r.level} /><div>
            <h3>{r.name} <RiskBadge level={r.level} /> <span className="small muted">confidence: {r.confidence}</span></h3>
            <ul className="plain small">{r.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div></li>))}</ul>
      </section>
    </>
  );
}

function DemandTab({ res }) {
  return (
    <>
      <section className="panel"><h2>Estimated affected population</h2>
        {!res.affected.length && <p className="muted">No region is at medium or high risk.</p>}
        {res.affected.map((e) => {
          const name = res.risks.find((r) => r.regionCode === e.regionCode)?.name;
          return (
            <div key={e.regionCode} className="block">
              <h3>{name} <RiskBadge level={e.riskLevel} /></h3>
              {!e.available ? <Notice kind="error">No population data. No estimate is shown: assess manually.</Notice> : (
                <>
                  <p>About <strong>{fmt(e.totals.expected)}</strong> people may need assistance (range {fmt(e.totals.min)} to {fmt(e.totals.max)}).{e.partial && <span className="warn-text"> Lower bound: some settlements have no population data.</span>}</p>
                  <table className="table compact"><thead><tr><th>Settlement</th><th>Population</th><th>Flood-prone share</th><th>Expected to need help</th></tr></thead>
                    <tbody>{e.settlements.map((s) => <tr key={s.name}><td>{s.name}</td><td>{s.populationKnown ? fmt(s.population) : <span className="warn-text">unknown</span>}</td><td>{Math.round(s.floodProneShare * 100)}%</td><td>{s.populationKnown ? fmt(s.expected) : 'n/a'}</td></tr>)}</tbody></table>
                </>
              )}
            </div>
          );
        })}
      </section>
      <section className="panel"><h2>Resource demand and shortages</h2>
        <p className="small muted">Planning period {res.assumptions.planningDays} day(s): {res.assumptions.foodKgPerPersonPerDay} kg food and {res.assumptions.waterLPerPersonPerDay} L water per person per day, {res.assumptions.medicineKitsPerPerson} medicine kits per person. Shortage = demand minus local stock.</p>
        <table className="table"><thead><tr><th>Region</th><th>Resource</th><th>Required</th><th>Local stock</th><th>Shortage</th></tr></thead>
          <tbody>
            {res.demand.map((d) => {
              const name = res.risks.find((r) => r.regionCode === d.regionCode)?.name;
              if (!d.available) return <tr key={d.regionCode}><td>{name}</td><td colSpan={4} className="warn-text">{d.reason}</td></tr>;
              return RESOURCES.map((r, i) => <tr key={d.regionCode + r}>{i === 0 && <td rowSpan={3}>{name}</td>}<td>{r}</td><td>{fmt(d.required[r])} {UNITS[r]}</td><td>{fmt(d.local[r])}</td><td className={d.shortage[r] ? 'warn-text' : ''}>{fmt(d.shortage[r])}</td></tr>);
            })}
            <tr className="total"><td colSpan={2}><strong>Total</strong></td><td>{RESOURCES.map((r) => `${fmt(res.totals.required[r])} ${UNITS[r]}`).join(' · ')}</td><td>{RESOURCES.map((r) => fmt(res.totals.local[r])).join(' · ')}</td><td>{RESOURCES.map((r) => fmt(res.totals.shortage[r])).join(' · ')}</td></tr>
          </tbody></table>
      </section>
    </>
  );
}

function LogisticsTab({ res }) {
  const [roads, setRoads] = useState(null);
  useEffect(() => { api.get('/roads').then(setRoads).catch(() => {}); }, []);
  const routes = res.allocations.filter((a) => a.route.primary).map((a) => ({ id: a.id, coords: a.route.primary.coords, status: a.route.status, label: `${a.supplierName} to ${a.destinationName}` }));
  return (
    <>
      <section className="panel flush"><MapView risks={res.risks} roads={roads} routes={routes} height={420} />
        <p className="map-legend small">Blue lines: recommended routes. Purple: rerouted because the preferred road is blocked. Dashed red: closed roads.</p></section>
      <section className="panel"><h2>Proposed allocation</h2>
        {!res.allocations.length && <p className="muted">No deliveries proposed.</p>}
        {!!res.allocations.length && <table className="table"><thead><tr><th>Priority</th><th>Supplier</th><th>Destination</th><th>Items</th><th>Route</th></tr></thead>
          <tbody>{res.allocations.map((a) => (
            <tr key={a.id}>
              <td>{a.priorityRank}</td>
              <td>{a.supplierName}{a.quality !== 'ok' && <><br /><span className="warn-text small">Stock data {a.quality}: verify</span></>}</td>
              <td>{a.destinationName}</td><td>{items(a.items)}</td>
              <td><Status value={a.route.status === 'ok' ? 'delivered' : a.route.status} label={a.route.status === 'ok' ? 'route open' : undefined} /><br />{a.route.primary.distanceKm} km, about {a.route.primary.etaHours} h
                <details><summary>Path</summary><ol className="plain small">{a.route.primary.segments.map((s) => <li key={s.code}>{s.name} ({s.status})</li>)}</ol>
                  {a.route.avoided.length > 0 && <p className="small warn-text">Avoids closed: {a.route.avoided.map((s) => s.name).join(', ')}</p>}
                  {a.route.alternative && <p className="small">Alternative: {a.route.alternative.distanceKm} km, about {a.route.alternative.etaHours} h</p>}</details></td>
            </tr>))}</tbody></table>}
      </section>
      {!!res.unresolved.length && <section className="panel"><h2>Unresolved shortages</h2>
        <ul className="warnings">{res.unresolved.map((u, i) => <li key={i} className="w-warning">{res.risks.find((r) => r.regionCode === u.regionCode)?.name}: {fmt(u.amount)} {UNITS[u.resource]} of {u.resource} ({u.reason.replaceAll('_', ' ').toLowerCase()})</li>)}</ul></section>}
      {!!res.inaccessibleRegions.length && <Notice kind="error">Inaccessible destinations needing manual intervention: {res.inaccessibleRegions.join(', ')}</Notice>}
      {!!res.supplierFlags.length && <section className="panel"><h2>Supplier record issues</h2>
        <ul className="warnings">{res.supplierFlags.map((f) => <li key={f.supplierCode} className={f.usable ? 'w-warning' : 'w-critical'}><b>{f.supplierName}</b> {f.flags.join('; ')} {!f.usable && '(excluded)'}</li>)}</ul></section>}
      <section className="panel"><h2>Nearby supplier options by region</h2>
        {Object.entries(res.candidates).map(([code, list]) => (
          <div key={code} className="block"><h3>{res.risks.find((r) => r.regionCode === code)?.name}</h3>
            <table className="table compact"><thead><tr><th>Supplier</th><th>ETA</th><th>Distance</th><th>Stock (food / water / medicine)</th></tr></thead>
              <tbody>{list.map((c) => <tr key={c.supplierCode}><td>{c.supplierName}</td><td>{c.etaHours} h</td><td>{c.distanceKm} km</td><td>{RESOURCES.map((r) => fmt(c.inventory[r])).join(' / ')}</td></tr>)}</tbody></table></div>))}
      </section>
    </>
  );
}

function ApprovalTab({ plan, reload, can }) {
  const res = plan.result;
  const critical = res.warnings.filter((w) => w.level === 'critical');
  const [confirm, setConfirm] = useState(false);
  const [ack, setAck] = useState(false);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const act = useAction();
  const ship = useAction();
  const [notice, setNotice] = useState('');
  const nav = useNavigate();
  const canApprove = can('admin', 'coordinator');

  const approve = () => act.run(async () => { await api.post(`/plans/${plan.id}/approve`, { confirm: true, acknowledgeWarnings: ack, note }); await reload(); });
  const reject = () => act.run(async () => { await api.post(`/plans/${plan.id}/reject`, { note: reason }); await reload(); });
  const remove = () => act.run(async () => { await api.del(`/plans/${plan.id}`); nav('/plans'); });
  const move = (s, status) => {
    let n = '';
    if (['failed', 'cancelled'].includes(status)) { n = window.prompt(`Why is shipment ${s.id} being marked ${status}?`) || ''; if (!n) return; }
    if (status === 'dispatched' && !window.confirm('Record this shipment as dispatched? This reserves the supplier stock in ClimateGuide. It does not contact the supplier: arrange the dispatch with them directly.')) return;
    ship.run(async () => { const r = await api.patch(`/plans/${plan.id}/shipments/${s.id}`, { status, note: n }); setNotice(r.notice || ''); await reload(); });
  };

  return (
    <>
      <section className="panel">
        <h2>Approval</h2>
        {plan.approval && <Notice kind={plan.approval.rejected ? 'error' : 'success'}>{plan.approval.rejected ? 'Rejected' : 'Approved'} by {plan.approval.by.name} ({plan.approval.by.role}) on {dt(plan.approval.at)}.{plan.approval.note && <> Note: {plan.approval.note}</>}</Notice>}
        {plan.status === 'draft' && (canApprove ? (
          <div className="form">
            <p>Review the plan, then approve or reject it. Approval creates the shipment list for tracking. ClimateGuide never contacts suppliers or dispatches anything itself.</p>
            {!!critical.length && <div className="alert error"><strong>{critical.length} critical warning(s)</strong><ul className="plain">{critical.map((w, i) => <li key={i}>{w.message}</li>)}</ul>
              <label className="check"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I have read the critical warnings and accept them.</label></div>}
            <label className="field"><span>Approval note (optional)</span><input maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></label>
            <label className="check"><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /> I am authorised to approve this plan and have reviewed the estimates and their uncertainty.</label>
            <ErrorBox error={act.error} />
            <div className="row">
              <button className="btn primary" disabled={!confirm || (critical.length > 0 && !ack) || act.busy} onClick={approve}>Approve plan</button>
              <input aria-label="Reason for rejection" placeholder="Reason for rejecting" value={reason} onChange={(e) => setReason(e.target.value)} />
              <button className="btn" disabled={reason.trim().length < 3 || act.busy} onClick={reject}>Reject</button>
              <button className="btn danger" disabled={act.busy} onClick={() => window.confirm('Delete this draft plan?') && remove()}>Delete draft</button>
            </div>
          </div>
        ) : <Notice>Only coordinators and administrators can approve plans.</Notice>)}
      </section>

      <section className="panel"><h2>Relief distribution tracking</h2>
        {plan.status === 'draft' && <p className="muted">Shipments appear here once the plan is approved.</p>}
        {plan.status === 'rejected' && <p className="muted">This plan was rejected: no shipments.</p>}
        {notice && <Notice kind="warn">{notice}</Notice>}
        <ErrorBox error={ship.error} />
        {!!plan.shipments?.length && <table className="table"><thead><tr><th>Shipment</th><th>Route</th><th>Items</th><th>ETA</th><th>Status</th><th>Update</th></tr></thead>
          <tbody>{plan.shipments.map((s) => (
            <tr key={s.id}><td>{s.id}<br /><span className="small muted">priority {s.priorityRank}</span></td><td>{s.supplierName} to {s.destinationName}</td><td>{items(s.items)}</td><td>{s.etaHours} h</td>
              <td><Status value={s.status} /><details><summary>History</summary><ul className="plain small">{s.history.map((h, i) => <li key={i}>{h.status}: {dt(h.at)} by {h.by}{h.note && ` (${h.note})`}</li>)}</ul></details></td>
              <td>{can('admin', 'coordinator', 'logistics') && (NEXT[s.status] || []).map((n) => <button key={n} className="btn small-btn" disabled={ship.busy} onClick={() => move(s, n)}>{n.replace('_', ' ')}</button>)}</td></tr>))}</tbody></table>}
      </section>
    </>
  );
}

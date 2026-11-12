import { useState } from 'react';
import { api, dt } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ErrorBox, Loading, Status, useAction, useAsync } from '../components/ui.jsx';
import { ReportForm } from './ReportIncident.jsx';

export default function Reports() {
  const { can } = useAuth();
  const [status, setStatus] = useState('active');
  const list = useAsync(() => api.get(`/reports?status=${status}`), [status]);
  const act = useAction();
  const toggle = (r) => act.run(async () => { await api.patch(`/reports/${r.id}`, { status: r.status === 'active' ? 'resolved' : 'active' }); list.reload(); });
  return (
    <>
      <header className="page-head"><div><h1>Incident reports</h1><p className="lede">Reports from the public and staff. Duplicates inside the matching window are merged. Active closure reports change routing; resolve a report when the road reopens.</p></div>
        <label className="field inline"><span>Show</span><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="active">Active</option><option value="resolved">Resolved</option><option value="">All</option></select></label></header>
      <ErrorBox error={act.error} />
      <section className="panel">
        {list.loading ? <Loading /> : <ErrorBox error={list.error} />}
        {list.data && !list.data.reports.length && <p className="muted">No reports to show.</p>}
        {!!list.data?.reports.length && <table className="table"><thead><tr><th>Type</th><th>Region</th><th>Road</th><th>Severity</th><th>Details</th><th>Merged</th><th>Status</th><th /></tr></thead>
          <tbody>{list.data.reports.map((r) => <tr key={r.id}><td>{r.type.replace('_', ' ')}<br /><span className="small muted">{dt(r.reportedAt)} · {r.source}</span></td><td>{r.regionCode}</td><td>{r.edgeCode || '–'}</td><td>{r.severity}/5</td><td className="small">{r.description}</td><td>{(r.duplicateCount || 0) + 1}</td><td><Status value={r.status === 'active' ? 'in_transit' : 'delivered'} /> {r.status}</td>
            <td>{can('admin', 'coordinator') && <button className="btn small-btn" disabled={act.busy} onClick={() => toggle(r)}>{r.status === 'active' ? 'Mark resolved' : 'Reopen'}</button>}</td></tr>)}</tbody></table>}
      </section>
      {can('admin', 'coordinator', 'logistics') && <><h2>Add a report</h2><ReportForm onDone={list.reload} /></>}
    </>
  );
}

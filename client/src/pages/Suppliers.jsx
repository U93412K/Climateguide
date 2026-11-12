import { useState } from 'react';
import { api, dt, fmt, RESOURCES, UNITS } from '../api.js';
import { useAuth } from '../auth.jsx';
import MapView from '../components/MapView.jsx';
import { ErrorBox, Field, Loading, Notice, useAction, useAsync } from '../components/ui.jsx';

function InventoryEditor({ initial, onSave, busy }) {
  const [v, setV] = useState(RESOURCES.reduce((a, r) => ({ ...a, [r]: initial?.[r] ?? '' }), {}));
  return (
    <form className="row inv" onSubmit={(e) => { e.preventDefault(); onSave(Object.fromEntries(RESOURCES.map((r) => [r, Number(v[r])]))); }}>
      {RESOURCES.map((r) => <label key={r} className="field inline"><span>{r} ({UNITS[r]})</span><input type="number" min="0" required value={v[r]} onChange={(e) => setV({ ...v, [r]: e.target.value })} /></label>)}
      <button className="btn" disabled={busy}>Save stock</button>
    </form>
  );
}

export default function Suppliers() {
  const { can } = useAuth();
  const manage = can('admin', 'logistics');
  const sup = useAsync(() => api.get('/suppliers'), []);
  const regions = useAsync(() => api.get('/regions'), []);
  const [open, setOpen] = useState(null);
  const [openReg, setOpenReg] = useState(null);
  const act = useAction();
  const [add, setAdd] = useState(false);
  const [nf, setNf] = useState({ name: '', type: 'NGO', lat: '', lon: '', contact: '', food: 0, water: 0, medicine: 0 });
  const [note, setNote] = useState('');

  const saveStock = (s) => (inv) => act.run(async () => { await api.patch(`/suppliers/${s.id}/inventory`, inv); setOpen(null); sup.reload(); });
  const saveLocal = (r) => (inv) => act.run(async () => { await api.patch(`/regions/${r.code}/inventory`, inv); setOpenReg(null); regions.reload(); });
  const create = (e) => {
    e.preventDefault();
    act.run(async () => {
      const r = await api.post('/suppliers', { name: nf.name, type: nf.type, contact: nf.contact, location: { lat: nf.lat, lon: nf.lon }, inventory: { food: nf.food, water: nf.water, medicine: nf.medicine } });
      setNote(r.note); setAdd(false); sup.reload();
    });
  };
  const remove = (s) => window.confirm(`Delete ${s.name}?`) && act.run(async () => { await api.del(`/suppliers/${s.id}`); sup.reload(); });
  const Q = { ok: 'Up to date', stale: 'Stale', invalid: 'Invalid' };

  return (
    <>
      <header className="page-head"><div><h1>Suppliers and stock</h1><p className="lede">Supplier inventory is maintained by hand. Records that are stale or inconsistent are flagged, and invalid ones are left out of matching.</p></div>
        {manage && <button className="btn primary" onClick={() => setAdd(!add)}>{add ? 'Cancel' : 'Add supplier'}</button>}</header>
      {note && <Notice kind="warn">{note}</Notice>}
      <ErrorBox error={act.error} />
      {add && (
        <form className="panel form" onSubmit={create}>
          <h2>New supplier</h2>
          <div className="grid2">
            <Field label="Name"><input required minLength={2} value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} /></Field>
            <Field label="Type"><input value={nf.type} onChange={(e) => setNf({ ...nf, type: e.target.value })} /></Field>
            <Field label="Latitude"><input type="number" step="any" min="-90" max="90" required value={nf.lat} onChange={(e) => setNf({ ...nf, lat: e.target.value })} /></Field>
            <Field label="Longitude"><input type="number" step="any" min="-180" max="180" required value={nf.lon} onChange={(e) => setNf({ ...nf, lon: e.target.value })} /></Field>
            <Field label="Contact (business line only)"><input value={nf.contact} onChange={(e) => setNf({ ...nf, contact: e.target.value })} /></Field>
          </div>
          <div className="row">{RESOURCES.map((r) => <Field key={r} label={`${r} (${UNITS[r]})`}><input type="number" min="0" required value={nf[r]} onChange={(e) => setNf({ ...nf, [r]: e.target.value })} /></Field>)}</div>
          <button className="btn primary" disabled={act.busy}>Create supplier</button>
        </form>
      )}
      {sup.loading ? <Loading /> : <ErrorBox error={sup.error} />}
      {sup.data && <>
        <section className="panel flush"><MapView suppliers={sup.data.suppliers} height={300} /></section>
        <section className="panel">
          <table className="table"><thead><tr><th>Supplier</th><th>Food (kg)</th><th>Water (L)</th><th>Medicine (kits)</th><th>Record</th><th /></tr></thead>
            <tbody>{sup.data.suppliers.map((s) => (
              <tr key={s.id}>
                <td><strong>{s.name}</strong><br /><span className="small muted">{s.type} · {s.code}</span></td>
                {RESOURCES.map((r) => <td key={r} className={s.inventory[r] < 0 ? 'warn-text' : ''}>{fmt(s.inventory[r])}</td>)}
                <td><span className={`badge q-${s.assessment.quality}`}>{Q[s.assessment.quality]}</span><br /><span className="small muted">{dt(s.inventoryUpdatedAt)}</span>{s.assessment.flags.map((f, i) => <div key={i} className="small warn-text">{f}</div>)}</td>
                <td>{manage && <><button className="btn small-btn" onClick={() => setOpen(open === s.id ? null : s.id)}>Update stock</button>{can('admin') && <button className="btn small-btn danger" onClick={() => remove(s)}>Delete</button>}</>}</td>
              </tr>))}
              {open && <tr><td colSpan={6}><InventoryEditor initial={sup.data.suppliers.find((s) => s.id === open)?.inventory} busy={act.busy} onSave={saveStock(sup.data.suppliers.find((s) => s.id === open))} /></td></tr>}
            </tbody></table>
        </section></>}
      <section className="panel"><h2>Local stock in affected regions</h2>
        {regions.loading ? <Loading /> : <ErrorBox error={regions.error} />}
        {regions.data && <table className="table compact"><thead><tr><th>Region</th><th>Food (kg)</th><th>Water (L)</th><th>Medicine (kits)</th><th /></tr></thead>
          <tbody>{regions.data.regions.map((r) => <tr key={r.id}><td>{r.name}</td>{RESOURCES.map((k) => <td key={k}>{fmt(r.localInventory[k])}</td>)}<td><button className="btn small-btn" onClick={() => setOpenReg(openReg === r.code ? null : r.code)}>Update</button></td></tr>)}
            {openReg && <tr><td colSpan={5}><InventoryEditor initial={regions.data.regions.find((r) => r.code === openReg).localInventory} busy={act.busy} onSave={saveLocal(regions.data.regions.find((r) => r.code === openReg))} /></td></tr>}</tbody></table>}
      </section>
    </>
  );
}

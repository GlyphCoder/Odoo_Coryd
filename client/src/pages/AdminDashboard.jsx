import { useEffect, useState } from 'react';
import api, { apiError } from '../api.js';
import { Button, Card, Input, Select, Badge, Empty, Spinner, money } from '../components/ui.jsx';

const TABS = ['Overview', 'Employees', 'Vehicles', 'Settings'];

export default function AdminDashboard() {
  const [tab, setTab] = useState('Overview');
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-800">Admin — Organization</h1>
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === t ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'Overview' && <Overview />}
      {tab === 'Employees' && <Employees />}
      {tab === 'Vehicles' && <Vehicles />}
      {tab === 'Settings' && <Settings />}
    </div>
  );
}

function Kpi({ label, value }) {
  return (
    <Card className="p-4">
      <div className="text-2xl font-bold text-slate-800">{value}</div>
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
    </Card>
  );
}

function Overview() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get('/admin/overview').then(({ data }) => setData(data)).catch(() => setData({ error: true })); }, []);
  if (!data) return <Spinner />;
  if (data.error) return <Empty title="Could not load reports" />;
  const { totals, perVehicle, monthly, participation } = data;
  const maxDist = Math.max(1, ...monthly.map((m) => Number(m.distance)));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Total trips" value={totals.total_trips} />
        <Kpi label="Distance (km)" value={Number(totals.total_distance).toFixed(0)} />
        <Kpi label="Revenue" value={money(totals.total_revenue)} />
        <Kpi label="Fuel cost" value={money(totals.total_fuel_cost)} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Cost / km" value={money(totals.cost_per_km)} />
        <Kpi label="Active employees" value={participation.active_employees} />
        <Kpi label="Active drivers" value={participation.active_drivers} />
        <Kpi label="Open rides" value={participation.open_rides} />
      </div>

      <Card className="p-5">
        <h2 className="mb-4 font-semibold text-slate-700">Monthly distance</h2>
        {monthly.length === 0 ? <Empty title="No data yet" /> : (
          <div className="flex items-end gap-3" style={{ height: 160 }}>
            {monthly.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center justify-end gap-1">
                <div className="w-full rounded-t bg-brand" style={{ height: `${(Number(m.distance) / maxDist) * 130}px` }} title={`${m.distance} km`} />
                <div className="text-[10px] text-slate-400">{m.month.slice(2)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 font-semibold text-slate-700">Vehicle-wise cost analysis</h2>
        {perVehicle.length === 0 ? <Empty title="No completed trips yet" /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-slate-400">
              <th className="py-2">Vehicle</th><th>Trips</th><th>Distance</th><th>Fuel cost</th><th>Cost/km</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {perVehicle.map((v, i) => {
                const cpk = Number(v.distance) > 0 ? Number(v.fuel_cost) / Number(v.distance) : 0;
                return (
                  <tr key={i} className="text-slate-700">
                    <td className="py-2">{v.vehicle_model} <span className="text-slate-400">{v.registration_number}</span></td>
                    <td>{v.trips}</td><td>{Number(v.distance).toFixed(1)} km</td>
                    <td>{money(v.fuel_cost)}</td><td>{money(cpk)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function Employees() {
  const [list, setList] = useState(null);
  const [form, setForm] = useState({ fullName: '', email: '', password: '', department: '', designation: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => api.get('/admin/employees').then(({ data }) => setList(data.employees)).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const add = async (e) => {
    e.preventDefault(); setError(''); setBusy(true);
    try { await api.post('/admin/employees', form); setForm({ fullName: '', email: '', password: '', department: '', designation: '' }); load(); }
    catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  };
  const setStatus = async (id, status) => { await api.patch(`/admin/employees/${id}/status`, { status }); load(); };

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h2 className="mb-3 font-semibold text-slate-700">Add employee</h2>
        <form onSubmit={add} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Full name" required value={form.fullName} onChange={set('fullName')} />
          <Input label="Email" type="email" required value={form.email} onChange={set('email')} />
          <Input label="Temp password" required value={form.password} onChange={set('password')} />
          <Input label="Department" value={form.department} onChange={set('department')} />
          <Input label="Designation" value={form.designation} onChange={set('designation')} />
          {error && <p className="sm:col-span-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
          <div className="sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add employee'}</Button></div>
        </form>
      </Card>

      {list === null ? <Spinner /> : (
        <Card className="p-5">
          <h2 className="mb-3 font-semibold text-slate-700">Employees ({list.length})</h2>
          <div className="divide-y divide-slate-100">
            {list.map((e) => (
              <div key={e.employee_id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <div className="font-medium text-slate-700">{e.full_name} <Badge status={e.status}>{e.status}</Badge></div>
                  <div className="text-xs text-slate-400">{e.email} · {e.department || '—'} · {e.designation || '—'}</div>
                </div>
                <Select value={e.status} onChange={(ev) => setStatus(e.employee_id, ev.target.value)} className="w-36">
                  {['ACTIVE', 'INACTIVE', 'SUSPENDED'].map((s) => <option key={s}>{s}</option>)}
                </Select>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function Vehicles() {
  const [list, setList] = useState(null);
  const load = () => api.get('/admin/vehicles').then(({ data }) => setList(data.vehicles)).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  const verify = async (id, isVerified) => { await api.patch(`/admin/vehicles/${id}/verify`, { isVerified }); load(); };
  if (list === null) return <Spinner />;
  return (
    <Card className="p-5">
      <h2 className="mb-3 font-semibold text-slate-700">Vehicles & drivers ({list.length})</h2>
      {list.length === 0 ? <Empty title="No vehicles registered" /> : (
        <div className="divide-y divide-slate-100">
          {list.map((v) => (
            <div key={v.vehicle_id} className="flex items-center justify-between py-2.5 text-sm">
              <div>
                <div className="font-medium text-slate-700">{v.vehicle_model} · {v.registration_number} {v.is_verified ? <Badge status="COMPLETED">Verified</Badge> : <Badge status="PENDING">Pending</Badge>}</div>
                <div className="text-xs text-slate-400">Owner: {v.owner_name} · {v.seating_capacity} seats · {v.fuel_type}</div>
              </div>
              <Button variant={v.is_verified ? 'outline' : 'primary'} onClick={() => verify(v.vehicle_id, !v.is_verified)}>
                {v.is_verified ? 'Unverify' : 'Verify'}
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Settings() {
  const [s, setS] = useState(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get('/admin/settings').then(({ data }) => setS(data.settings)).catch(() => setS({})); }, []);
  const set = (k) => (e) => setS({ ...s, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setSaved(false);
    try {
      const { data } = await api.patch('/admin/settings', {
        fuelCostPerLitre: +s.fuel_cost_per_litre, avgFuelEfficiencyKmpl: +s.avg_fuel_efficiency_kmpl,
        costPerKm: +s.cost_per_km, maxRideRadiusKm: +s.max_ride_radius_km,
      });
      setS(data.settings); setSaved(true);
    } finally { setBusy(false); }
  };
  if (!s) return <Spinner />;
  return (
    <Card className="p-5">
      <h2 className="mb-3 font-semibold text-slate-700">Organization settings</h2>
      <form onSubmit={save} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Fuel cost / litre (₹)" type="number" step="0.01" value={s.fuel_cost_per_litre ?? ''} onChange={set('fuel_cost_per_litre')} />
        <Input label="Avg fuel efficiency (km/l)" type="number" step="0.01" value={s.avg_fuel_efficiency_kmpl ?? ''} onChange={set('avg_fuel_efficiency_kmpl')} />
        <Input label="Cost / km (₹)" type="number" step="0.01" value={s.cost_per_km ?? ''} onChange={set('cost_per_km')} />
        <Input label="Max ride radius (km)" type="number" step="1" value={s.max_ride_radius_km ?? ''} onChange={set('max_ride_radius_km')} />
        <div className="sm:col-span-2 flex items-center gap-3">
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</Button>
          {saved && <span className="text-sm text-emerald-600">✓ Saved</span>}
        </div>
      </form>
    </Card>
  );
}

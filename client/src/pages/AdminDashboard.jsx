import { useEffect, useState } from 'react';
import {
  Check, ShieldCheck, LayoutGrid, Users, Car, Settings as SettingsIcon,
  UserPlus, Search, BarChart3,
} from 'lucide-react';
import api, { apiError } from '../api.js';
import {
  Button, Card, Input, Select, Badge, Empty, Spinner, Alert, PageTitle,
  Pagination, usePagination, money,
} from '../components/ui.jsx';

const TABS = [
  { key: 'Overview',  Icon: LayoutGrid },
  { key: 'Employees', Icon: Users },
  { key: 'Vehicles',  Icon: Car },
  { key: 'Settings',  Icon: SettingsIcon },
];

export default function AdminDashboard() {
  const [tab, setTab] = useState('Overview');

  return (
    <div className="space-y-5">
      <PageTitle icon={ShieldCheck} subtitle="Organization-wide reporting, people and policy.">
        Admin — Organization
      </PageTitle>

      {/* Tabs */}
      <div className="glass flex flex-wrap gap-1.5 p-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={[
              'inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold',
              'transition-all duration-200 active:scale-95 sm:flex-none',
              tab === t.key
                ? 'bg-gradient-to-br from-brand to-brand-dark text-white shadow-glow ring-1 ring-white/25'
                : 'text-ink-600 hover:bg-white/70 hover:text-brand-dark',
            ].join(' ')}
          >
            <t.Icon className="h-3.5 w-3.5" strokeWidth={2} />
            {t.key}
          </button>
        ))}
      </div>

      {tab === 'Overview'  && <Overview />}
      {tab === 'Employees' && <Employees />}
      {tab === 'Vehicles'  && <Vehicles />}
      {tab === 'Settings'  && <Settings />}
    </div>
  );
}

function Kpi({ label, value }) {
  return (
    <Card variant="hero" className="p-4" hover>
      <div className="text-2xl font-extrabold tracking-tight text-ink-900">{value}</div>
      <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-ink-400">{label}</div>
    </Card>
  );
}

/* ══════════════════════════════════════════════════════════
   Overview
   ══════════════════════════════════════════════════════════ */
function Overview() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get('/admin/overview').then(({ data }) => setData(data)).catch(() => setData({ error: true })); }, []);

  const perVehiclePager = usePagination(data?.perVehicle, 8);

  if (!data) return <Spinner label="Loading reports…" />;
  if (data.error) return <Empty icon={BarChart3} title="Could not load reports" />;

  const { totals, monthly, participation } = data;
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

      {/* Monthly distance chart */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2 border-b border-white/60 pb-3">
          <BarChart3 className="h-4 w-4 text-brand" />
          <h2 className="font-bold text-ink-800">Monthly distance</h2>
        </div>
        {monthly.length === 0 ? <Empty icon={BarChart3} title="No data yet" /> : (
          <div className="flex min-h-48 items-end gap-4 overflow-x-auto border-b border-white/60 pb-3">
            {monthly.map((m) => (
              <div key={m.month} className="flex w-20 shrink-0 flex-col items-center justify-end gap-2">
                <div className="text-xs font-bold text-ink-600">{Number(m.distance).toFixed(0)} km</div>
                <div
                  className="w-10 rounded-t-xl bg-gradient-to-t from-brand-dark to-brand-mid shadow-glow ring-1 ring-white/25 transition-all duration-300 hover:from-brand hover:to-brand-light"
                  style={{ height: `${Math.max(18, (Number(m.distance) / maxDist) * 120)}px` }}
                  title={`${Number(m.distance).toFixed(1)} km across ${m.trips} trips`}
                />
                <div className="text-[11px] font-semibold text-ink-400">{m.month.slice(2)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Vehicle-wise cost analysis */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between gap-2 border-b border-white/60 pb-3">
          <div className="flex items-center gap-2">
            <Car className="h-4 w-4 text-brand" />
            <h2 className="font-bold text-ink-800">Vehicle-wise cost analysis</h2>
          </div>
          {perVehiclePager.total > 0 && (
            <span className="rounded-lg bg-brand/10 px-2.5 py-1 text-xs font-bold text-brand-dark ring-1 ring-brand/20">
              {perVehiclePager.total}
            </span>
          )}
        </div>

        {perVehiclePager.total === 0 ? <Empty icon={Car} title="No completed trips yet" /> : (
          <div className="space-y-4">
            <div className="-mx-2 overflow-x-auto px-2">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-ink-400">
                    <th className="pb-2">Vehicle</th><th className="pb-2">Trips</th>
                    <th className="pb-2">Distance</th><th className="pb-2">Fuel cost</th><th className="pb-2">Cost/km</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/60">
                  {perVehiclePager.items.map((v, i) => {
                    const cpk = Number(v.distance) > 0 ? Number(v.fuel_cost) / Number(v.distance) : 0;
                    return (
                      <tr key={i} className="text-ink-700 transition hover:bg-white/50">
                        <td className="py-2.5 font-semibold">
                          {v.vehicle_model}{' '}
                          <span className="font-mono text-xs font-normal text-ink-400">{v.registration_number}</span>
                        </td>
                        <td className="py-2.5">{v.trips}</td>
                        <td className="py-2.5">{Number(v.distance).toFixed(1)} km</td>
                        <td className="py-2.5">{money(v.fuel_cost)}</td>
                        <td className="py-2.5 font-bold text-brand-dark">{money(cpk)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Pagination {...perVehiclePager} label="vehicles" compact />
          </div>
        )}
      </Card>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Employees
   ══════════════════════════════════════════════════════════ */
function Employees() {
  const [list, setList] = useState(null);
  const [query, setQuery] = useState('');
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

  /* Client-side search, then paginate the filtered set */
  const q = query.trim().toLowerCase();
  const filtered = !Array.isArray(list) ? [] : q
    ? list.filter((e) =>
        [e.full_name, e.email, e.department, e.designation]
          .filter(Boolean).some((f) => String(f).toLowerCase().includes(q)))
    : list;

  const pager = usePagination(filtered, 8, q);

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex items-center gap-2 border-b border-white/60 pb-3">
          <UserPlus className="h-4 w-4 text-brand" />
          <h2 className="font-bold text-ink-800">Add employee</h2>
        </div>
        <form onSubmit={add} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Full name" required value={form.fullName} onChange={set('fullName')} />
          <Input label="Email" type="email" required value={form.email} onChange={set('email')} />
          <Input label="Temp password" required value={form.password} onChange={set('password')} />
          <Input label="Department" value={form.department} onChange={set('department')} />
          <div className="sm:col-span-2">
            <Input label="Designation" value={form.designation} onChange={set('designation')} />
          </div>
          {error && <div className="sm:col-span-2"><Alert variant="error">{error}</Alert></div>}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy}>{busy ? 'Adding…' : <><UserPlus className="h-4 w-4" /> Add employee</>}</Button>
          </div>
        </form>
      </Card>

      {list === null ? <Spinner label="Loading employees…" /> : (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/60 pb-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-brand" />
              <h2 className="font-bold text-ink-800">Employees ({list.length})</h2>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, email, dept…"
                className="glass-input w-full rounded-xl py-2 pl-9 pr-3 text-sm text-ink-800 placeholder:text-ink-400 outline-none transition-all"
              />
            </div>
          </div>

          {pager.total === 0 ? (
            <div className="pt-4">
              <Empty icon={Users} title="No employees match" hint="Try a different search term." />
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="divide-y divide-white/60">
                {pager.items.map((e) => (
                  <div key={e.employee_id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 font-bold text-ink-800">
                        {e.full_name} <Badge status={e.status}>{e.status}</Badge>
                      </div>
                      <div className="mt-0.5 text-xs text-ink-400">
                        {e.email} · {e.department || '—'} · {e.designation || '—'}
                      </div>
                    </div>
                    <Select value={e.status} onChange={(ev) => setStatus(e.employee_id, ev.target.value)} className="w-36">
                      {['PENDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED'].map((s) => <option key={s}>{s}</option>)}
                    </Select>
                  </div>
                ))}
              </div>

              <Pagination {...pager} label="employees" />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Vehicles
   ══════════════════════════════════════════════════════════ */
function Vehicles() {
  const [list, setList] = useState(null);
  const load = () => api.get('/admin/vehicles').then(({ data }) => setList(data.vehicles)).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  const verify = async (id, isVerified) => { await api.patch(`/admin/vehicles/${id}/verify`, { isVerified }); load(); };

  const pager = usePagination(list, 8);

  if (list === null) return <Spinner label="Loading vehicles…" />;

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 border-b border-white/60 pb-3">
        <Car className="h-4 w-4 text-brand" />
        <h2 className="font-bold text-ink-800">Vehicles &amp; drivers ({list.length})</h2>
      </div>

      {pager.total === 0 ? (
        <div className="pt-4"><Empty icon={Car} title="No vehicles registered" /></div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="divide-y divide-white/60">
            {pager.items.map((v) => (
              <div key={v.vehicle_id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 font-bold text-ink-800">
                    {v.vehicle_model}
                    <span className="font-mono text-xs font-normal text-ink-500">{v.registration_number}</span>
                    {v.is_verified ? <Badge status="COMPLETED">Verified</Badge> : <Badge status="PENDING">Pending</Badge>}
                  </div>
                  <div className="mt-0.5 text-xs text-ink-400">
                    Owner: {v.owner_name} · {v.seating_capacity} seats · {v.fuel_type}
                  </div>
                </div>
                <Button
                  variant={v.is_verified ? 'outline' : 'primary'}
                  size="sm"
                  onClick={() => verify(v.vehicle_id, !v.is_verified)}
                >
                  {v.is_verified ? 'Unverify' : <><Check className="h-3.5 w-3.5" /> Verify</>}
                </Button>
              </div>
            ))}
          </div>

          <Pagination {...pager} label="vehicles" />
        </div>
      )}
    </Card>
  );
}

/* ══════════════════════════════════════════════════════════
   Settings
   ══════════════════════════════════════════════════════════ */
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

  if (!s) return <Spinner label="Loading settings…" />;

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 border-b border-white/60 pb-3">
        <SettingsIcon className="h-4 w-4 text-brand" />
        <h2 className="font-bold text-ink-800">Organization settings</h2>
      </div>
      <form onSubmit={save} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Fuel cost / litre (₹)" type="number" step="0.01" value={s.fuel_cost_per_litre ?? ''} onChange={set('fuel_cost_per_litre')} />
        <Input label="Avg fuel efficiency (km/l)" type="number" step="0.01" value={s.avg_fuel_efficiency_kmpl ?? ''} onChange={set('avg_fuel_efficiency_kmpl')} />
        <Input label="Cost / km (₹)" type="number" step="0.01" value={s.cost_per_km ?? ''} onChange={set('cost_per_km')} />
        <Input label="Max ride radius (km)" type="number" step="1" value={s.max_ride_radius_km ?? ''} onChange={set('max_ride_radius_km')} />
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</Button>
          {saved && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50/80 px-2.5 py-1 text-sm font-bold text-emerald-700 ring-1 ring-emerald-200/70">
              <Check className="h-4 w-4" /> Saved
            </span>
          )}
        </div>
      </form>
    </Card>
  );
}

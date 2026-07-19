import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import {
  Check, ShieldCheck, LayoutGrid, Users, Car, Settings as SettingsIcon,
  UserPlus, Search, BarChart3, IdCard, FileText, Camera, Leaf, MapPin
} from 'lucide-react';
import api, { apiError } from '../api.js';
import {
  Button, Card, Input, Select, Badge, Empty, Spinner, Alert, PageTitle,
  Pagination, usePagination, money,
} from '../components/ui.jsx';

export default function AdminDashboard() {
  return (
    <div className="space-y-6">
      <PageTitle icon={ShieldCheck} subtitle="Organization reporting & policy">
        Admin Panel
      </PageTitle>

      <Routes>
        <Route path="" element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<Overview />} />
        <Route path="employees" element={<Employees />} />
        <Route path="vehicles" element={<Vehicles />} />
        <Route path="trips" element={<Trips />} />
        <Route path="settings" element={<Settings />} />
      </Routes>
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

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
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

        {/* Environmental Impact (CO2) chart */}
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2 border-b border-white/60 pb-3">
            <Leaf className="h-4 w-4 text-emerald-500" />
            <h2 className="font-bold text-ink-800">Environmental impact (CO₂ saved)</h2>
          </div>
          {monthly.length === 0 ? <Empty icon={Leaf} title="No data yet" /> : (
            <div className="flex min-h-48 items-end gap-4 overflow-x-auto border-b border-white/60 pb-3">
              {monthly.map((m) => {
                const co2Saved = Number(m.distance) * 0.192; // Avg 0.192 kg CO2 per km
                const maxCo2 = maxDist * 0.192;
                return (
                  <div key={m.month} className="flex w-20 shrink-0 flex-col items-center justify-end gap-2">
                    <div className="text-xs font-bold text-emerald-600">{co2Saved.toFixed(1)} kg</div>
                    <div
                      className="w-10 rounded-t-xl bg-gradient-to-t from-emerald-600 to-emerald-400 shadow-glow ring-1 ring-white/25 transition-all duration-300 hover:from-emerald-500 hover:to-emerald-300"
                      style={{ height: `${Math.max(18, (co2Saved / maxCo2) * 120)}px` }}
                      title={`${co2Saved.toFixed(1)} kg CO₂ saved across ${m.trips} shared rides`}
                    />
                    <div className="text-[11px] font-semibold text-ink-400">{m.month.slice(2)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

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
   Vehicles (Admin review)
   ══════════════════════════════════════════════════════════ */

const DOC_LABELS = {
  driving_license_url:    { label: 'Licence', Icon: IdCard },
  vehicle_rc_url:         { label: 'RC', Icon: FileText },
  proof_of_insurance_url: { label: 'Insurance', Icon: ShieldCheck },
  vehicle_photo_url:      { label: 'Car Photo', Icon: Car },
  driver_selfie_url:      { label: 'Selfie', Icon: Camera },
};

function DocThumb({ label, icon: Icon, url, onView }) {
  if (!url) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100/80 text-slate-300 ring-1 ring-slate-200/50">
          <Icon className="h-5 w-5 opacity-40" />
        </div>
        <span className="text-[9px] text-ink-400">{label}</span>
      </div>
    );
  }
  const isPdf = url.endsWith('.pdf');
  return (
    <button
      onClick={() => onView(url, label)}
      className="group flex flex-col items-center gap-0.5"
      title={`View ${label}`}
    >
      <div className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-brand/30 shadow-sm transition group-hover:ring-brand">
        {isPdf ? (
          <FileText className="h-5 w-5 text-rose-400" />
        ) : (
          <img src={url} alt={label} className="h-full w-full object-cover transition group-hover:scale-110" />
        )}
      </div>
      <span className="flex items-center gap-1 text-[9px] font-semibold text-brand">
        <Icon className="h-2.5 w-2.5" /> {label}
      </span>
    </button>
  );
}

/* Lightbox */
function Lightbox({ url, label, onClose }) {
  if (!url) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] max-w-3xl w-full mx-4 overflow-auto rounded-2xl bg-white/5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <span className="text-sm font-bold text-white">{label}</span>
          <button onClick={onClose} className="text-white/60 hover:text-white text-xl leading-none">✕</button>
        </div>
        <div className="p-4">
          {url.endsWith('.pdf') ? (
            <iframe src={url} className="w-full h-[70vh] rounded-xl" title={label} />
          ) : (
            <img src={url} alt={label} className="w-full rounded-xl object-contain max-h-[70vh]" />
          )}
        </div>
      </div>
    </div>
  );
}

/* Reject dialog */
function RejectDialog({ vehicleName, onConfirm, onCancel }) {
  const [note, setNote] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm mx-4 rounded-2xl bg-white/90 shadow-2xl p-5 space-y-4">
        <h3 className="font-bold text-ink-800">Reject vehicle: {vehicleName}</h3>
        <p className="text-sm text-ink-500">Provide a reason so the driver knows what to fix:</p>
        <textarea
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="e.g. Insurance document is expired, please reupload…"
          className="glass-input w-full rounded-xl px-3 py-2 text-sm text-ink-800 placeholder:text-ink-400 outline-none resize-none"
        />
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={() => onConfirm(note)}>Send rejection</Button>
        </div>
      </div>
    </div>
  );
}

function Vehicles() {
  const [list, setList]         = useState(null);
  const [lightbox, setLightbox] = useState(null); // { url, label }
  const [rejecting, setRejecting] = useState(null); // vehicle row

  const load = () => api.get('/admin/vehicles').then(({ data }) => setList(data.vehicles)).catch(() => setList([]));
  useEffect(() => { load(); }, []);

  const approve = async (id) => {
    await api.patch(`/admin/vehicles/${id}/verify`, { isVerified: true, note: null });
    load();
  };
  const reject = async (id, note) => {
    await api.patch(`/admin/vehicles/${id}/verify`, { isVerified: false, note });
    setRejecting(null);
    load();
  };

  const pager = usePagination(list, 5);

  if (list === null) return <Spinner label="Loading vehicles…" />;

  const pending  = list.filter((v) => !v.is_verified).length;
  const verified = list.filter((v) =>  v.is_verified).length;

  return (
    <>
      {/* Lightbox */}
      {lightbox && (
        <Lightbox url={lightbox.url} label={lightbox.label} onClose={() => setLightbox(null)} />
      )}

      {/* Reject dialog */}
      {rejecting && (
        <RejectDialog
          vehicleName={`${rejecting.vehicle_model} (${rejecting.registration_number})`}
          onConfirm={(note) => reject(rejecting.vehicle_id, note)}
          onCancel={() => setRejecting(null)}
        />
      )}

      <div className="space-y-4">
        {/* Summary pills */}
        <div className="flex flex-wrap gap-2">
          <span className="rounded-lg bg-amber-50/80 px-3 py-1 text-xs font-bold text-amber-700 ring-1 ring-amber-200/60">
            {pending} pending review
          </span>
          <span className="rounded-lg bg-emerald-50/80 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200/60">
            {verified} verified
          </span>
        </div>

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
                  <div key={v.vehicle_id} className="py-4">
                    {/* Header row */}
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 font-bold text-ink-800">
                          {v.vehicle_model}
                          <span className="font-mono text-xs font-normal text-ink-500">{v.registration_number}</span>
                          {v.is_verified
                            ? <Badge status="COMPLETED">Verified</Badge>
                            : <Badge status="PENDING">Pending</Badge>}
                        </div>
                        <div className="mt-0.5 text-xs text-ink-400">
                          Owner: <span className="font-semibold text-ink-600">{v.owner_name}</span>
                          {v.owner_email && <> · {v.owner_email}</>}
                          &nbsp;· {v.seating_capacity} seats · {v.fuel_type}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-2 shrink-0">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => approve(v.vehicle_id)}
                          disabled={v.is_verified}
                        >
                          <Check className="h-3.5 w-3.5" /> Approve
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRejecting(v)}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>

                    {/* Document thumbnails */}
                    <div className="mt-3 flex flex-wrap gap-3">
                      {Object.entries(DOC_LABELS).map(([col, doc]) => (
                        <DocThumb
                          key={col}
                          label={doc.label}
                          icon={doc.Icon}
                          url={v[col]}
                          onView={(url, lbl) => setLightbox({ url, label: lbl })}
                        />
                      ))}
                    </div>

                    {/* Rejection note (if any) */}
                    {v.verification_note && (
                      <p className="mt-2 rounded-lg bg-rose-50/70 px-3 py-1.5 text-xs font-medium text-rose-600 ring-1 ring-rose-200/60">
                        ⚠ Rejection note: {v.verification_note}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <Pagination {...pager} label="vehicles" />
            </div>
          )}
        </Card>
      </div>
    </>
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

/* ══════════════════════════════════════════════════════════
   Trips
   ══════════════════════════════════════════════════════════ */
function Trips() {
  const [list, setList] = useState(null);
  const [query, setQuery] = useState('');

  const load = () => api.get('/admin/trips').then(({ data }) => setList(data.trips)).catch(() => setList([]));
  useEffect(() => { load(); }, []);

  const q = query.trim().toLowerCase();
  const filtered = !Array.isArray(list) ? [] : q
    ? list.filter((t) =>
        [t.driver_name, t.pickup_address, t.destination_address, t.status]
          .filter(Boolean).some((f) => String(f).toLowerCase().includes(q)))
    : list;

  if (list === null) return <Spinner label="Loading trips…" />;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/60 pb-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-brand" />
          <h2 className="font-bold text-ink-800">All Trips ({filtered.length})</h2>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search driver, location…"
            className="glass-input w-full rounded-xl py-2 pl-9 pr-3 text-sm text-ink-800 placeholder:text-ink-400 outline-none transition-all"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="pt-4">
          <Empty icon={MapPin} title="No trips found" hint="Try a different search term." />
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="divide-y divide-white/60 max-h-[500px] overflow-y-auto pr-2">
            {filtered.map((t) => (
              <div key={t.trip_id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 font-bold text-ink-800">
                    {t.driver_name} <Badge status={t.status}>{t.status}</Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-ink-400">
                    {new Date(t.created_at).toLocaleDateString()} · {new Date(t.trip_date).toLocaleDateString()} {t.trip_time.slice(0,5)} · {t.passenger_count} passenger{t.passenger_count !== 1 ? 's' : ''}
                  </div>
                  <div className="mt-1 text-xs text-ink-600 truncate max-w-sm">
                    {t.pickup_address} → {t.destination_address}
                  </div>
                </div>
              </div>
            ))}
          </div>

        </div>
      )}
    </Card>
  );
}

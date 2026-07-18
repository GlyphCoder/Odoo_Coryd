import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Car, CalendarDays, Users, RefreshCw, Navigation, Route, Info } from 'lucide-react';
import api, { apiError } from '../api.js';
import AddressInput from '../components/AddressInput.jsx';
import MapView from '../components/MapView.jsx';
import { Button, Card, Input, Select, Empty, Alert, money } from '../components/ui.jsx';

const WEEKDAY_OPTIONS = [
  { label: 'Mon', value: 'MON' },
  { label: 'Tue', value: 'TUE' },
  { label: 'Wed', value: 'WED' },
  { label: 'Thu', value: 'THU' },
  { label: 'Fri', value: 'FRI' },
  { label: 'Sat', value: 'SAT' },
  { label: 'Sun', value: 'SUN' },
];

function SectionLabel({ icon: Icon, label }) {
  return (
    <div className="flex items-center gap-2 pb-1">
      <Icon className="h-4 w-4 text-brand" strokeWidth={1.75} />
      <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{label}</span>
    </div>
  );
}

export default function OfferRide() {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState(null);
  const [form, setForm] = useState({
    vehicleId: '', date: '', time: '', totalSeats: 1,
    isRecurring: false, selectedDays: [],
  });
  const [pickup, setPickup] = useState(null);
  const [dest,   setDest]   = useState(null);
  const [route,  setRoute]  = useState(null);
  const [busy,   setBusy]   = useState(false);
  const [error,  setError]  = useState('');

  useEffect(() => {
    api.get('/vehicles').then(({ data }) => {
      setVehicles(data.vehicles);
      if (data.vehicles[0]) setForm((f) => ({ ...f, vehicleId: data.vehicles[0].vehicle_id }));
    }).catch(() => setVehicles([]));
  }, []);

  const set = (k) => (e) =>
    setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const confirmRoute = async () => {
    if (!pickup || !dest) return setError('Select both pickup and destination');
    setError(''); setBusy(true);
    try {
      const { data } = await api.post('/geo/route', { pickup, destination: dest });
      setRoute(data);
    } catch (e) { setError(apiError(e)); }
    finally { setBusy(false); }
  };

  const publish = async () => {
    setError('');
    if (!form.vehicleId) return setError('Select a vehicle');
    if (!pickup || !dest) return setError('Select pickup and destination');
    if (!form.date || !form.time) return setError('Select date and time');
    if (form.isRecurring && form.selectedDays.length === 0)
      return setError('Select at least one weekday for recurring rides');
    setBusy(true);
    try {
      const departure = new Date(`${form.date}T${form.time}`).toISOString();
      await api.post('/rides', {
        vehicleId: form.vehicleId,
        pickupAddress: pickup.address, pickupLat: pickup.lat, pickupLng: pickup.lng,
        destinationAddress: dest.address, destinationLat: dest.lat, destinationLng: dest.lng,
        departureDatetime: departure,
        totalSeats: +form.totalSeats,
        isRecurring: form.isRecurring,
        recurrencePattern: form.isRecurring ? { days: form.selectedDays } : null,
      });
      navigate('/app/trips?role=driver');
    } catch (e) { setError(apiError(e)); }
    finally { setBusy(false); }
  };

  if (vehicles === null) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="flex items-center gap-3 text-slate-400">
          <svg className="h-5 w-5 animate-spin text-brand" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm font-medium">Loading vehicles…</span>
        </div>
      </div>
    );
  }

  if (vehicles.length === 0) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-bold text-slate-900">Offer a Ride</h1>
        <Empty
          icon={Car}
          title="No vehicles registered"
          hint="You must add at least one vehicle before publishing rides."
        >
          <Link to="/app/vehicles"><Button>Add a vehicle</Button></Link>
        </Empty>
      </div>
    );
  }

  const selected = vehicles.find((v) => v.vehicle_id === form.vehicleId);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Offer a Ride</h1>
        <p className="mt-1 text-sm text-slate-500">Share your route — fare is calculated automatically.</p>
      </div>

      <Card className="divide-y divide-slate-100">

        {/* Vehicle */}
        <div className="space-y-3 p-5">
          <SectionLabel icon={Car} label="Vehicle" />
          <Select value={form.vehicleId} onChange={set('vehicleId')}>
            {vehicles.map((v) => (
              <option key={v.vehicle_id} value={v.vehicle_id}>
                {v.vehicle_model} · {v.registration_number} · {v.seating_capacity} seats
              </option>
            ))}
          </Select>
        </div>

        {/* Route */}
        <div className="space-y-3 p-5">
          <SectionLabel icon={Navigation} label="Route" />
          <AddressInput
            label="Pickup location"
            value={pickup?.address}
            onSelect={(p) => { setPickup(p); setRoute(null); }}
            placeholder="Where from?"
          />
          <AddressInput
            label="Destination"
            value={dest?.address}
            onSelect={(d) => { setDest(d); setRoute(null); }}
            placeholder="Where to?"
          />
        </div>

        {/* Schedule */}
        <div className="space-y-3 p-5">
          <SectionLabel icon={CalendarDays} label="Schedule" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Input label="Date" type="date" value={form.date} onChange={set('date')} />
            <Input label="Time" type="time" value={form.time} onChange={set('time')} />
            <Input
              label="Seats"
              type="number"
              min="1"
              max={selected?.seating_capacity || 8}
              value={form.totalSeats}
              onChange={set('totalSeats')}
            />
          </div>
        </div>

        {/* Recurrence */}
        <div className="space-y-3 p-5">
          <SectionLabel icon={RefreshCw} label="Recurrence" />
          <label className="inline-flex cursor-pointer items-center gap-3">
            <div
              onClick={() => setForm({ ...form, isRecurring: !form.isRecurring, selectedDays: !form.isRecurring ? form.selectedDays : [] })}
              className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${form.isRecurring ? 'bg-brand' : 'bg-slate-200'}`}
            >
              <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${form.isRecurring ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm font-medium text-slate-700">Recurring ride</span>
          </label>

          {form.isRecurring && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Allowed weekdays</p>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_OPTIONS.map((day) => {
                  const active = form.selectedDays.includes(day.value);
                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => {
                        const selectedDays = active
                          ? form.selectedDays.filter((d) => d !== day.value)
                          : [...form.selectedDays, day.value];
                        setForm({ ...form, selectedDays });
                      }}
                      className={[
                        'rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all duration-150 active:scale-95',
                        active
                          ? 'border-brand bg-brand text-white shadow-sm'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                      ].join(' ')}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Fare info */}
        <div className="flex items-start gap-3 bg-brand-subtle px-5 py-3.5 text-sm text-brand-dark">
          <Info className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
          <span>Fare per seat is calculated automatically from the admin-set rate × your route distance.</span>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3 p-5">
          {error && <div className="w-full"><Alert variant="error">{error}</Alert></div>}
          <Button variant="outline" onClick={confirmRoute} disabled={busy || !pickup || !dest}>
            <Route className="h-4 w-4" /> Confirm route
          </Button>
          <Button onClick={publish} disabled={busy}>
            {busy ? 'Publishing…' : 'Publish ride'}
          </Button>
        </div>
      </Card>

      {/* Route preview */}
      {route && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <span className="text-sm font-semibold text-slate-800">Route preview</span>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium">{route.distanceKm} km</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium">~{route.durationMinutes} min</span>
            </div>
          </div>
          <MapView pickup={pickup} destination={dest} routeGeometry={route.geometry} height={300} follow={false} />
        </Card>
      )}
    </div>
  );
}

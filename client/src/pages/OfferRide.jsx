import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Car, CalendarDays, Users, RefreshCw, Navigation, Route, Info, AlertTriangle, CheckCircle2 } from 'lucide-react';
import api, { apiError } from '../api.js';
import AddressInput from '../components/AddressInput.jsx';
import MapView from '../components/MapView.jsx';
import { Button, Card, Input, Select, Empty, Alert, Spinner, PageTitle } from '../components/ui.jsx';

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
      <Icon className="h-4 w-4 text-brand" strokeWidth={1.9} />
      <span className="text-[11px] font-bold uppercase tracking-widest text-ink-500">{label}</span>
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
  const [nodes,  setNodes]  = useState([]);
  const [busy,   setBusy]   = useState(false);
  const [error,  setError]  = useState('');
  const [rideState, setRideState] = useState(null);

  useEffect(() => {
    api.get('/rides/state').then(({ data }) => setRideState(data)).catch(() => {});
  }, []);

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
      const { data } = await api.post('/rides', {
        vehicleId: form.vehicleId,
        pickupAddress: pickup.address, pickupLat: pickup.lat, pickupLng: pickup.lng,
        destinationAddress: dest.address, destinationLat: dest.lat, destinationLng: dest.lng,
        departureDatetime: departure,
        totalSeats: +form.totalSeats,
        isRecurring: form.isRecurring,
        recurrencePattern: form.isRecurring ? { days: form.selectedDays } : null,
      });
      if (data.nodes?.length) {
        setNodes(data.nodes);
        // Stay on page briefly to show nodes, then navigate
        setTimeout(() => navigate('/app/trips?role=driver'), 3000);
      } else {
        navigate('/app/trips?role=driver');
      }
    } catch (e) { setError(apiError(e)); }
    finally { setBusy(false); }
  };

  if (vehicles === null) {
    return (
      <Spinner label="Loading vehicles…" />
    );
  }

  if (vehicles.length === 0) {
    return (
      <div className="space-y-5">
        <PageTitle icon={Car} subtitle="Share your route — fare is calculated automatically.">
          Offer a Ride
        </PageTitle>
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

  const selected       = vehicles.find((v) => v.vehicle_id === form.vehicleId);
  const activeRide     = rideState?.asDriver;
  const activePassTrip = rideState?.asPassenger;
  const rideStatus     = rideState?.rideStatus ?? 'FREE';
  const isBlocked = !!(activeRide || activePassTrip);

  const STATUS_PILL = {
    FREE:    'bg-emerald-100 text-emerald-700 border-emerald-300 ring-emerald-200',
    RIDING:  'bg-amber-100 text-amber-700 border-amber-300 ring-amber-200',
    DRIVING: 'bg-blue-100 text-blue-700 border-blue-300 ring-blue-200',
  };
  const STATUS_ICON = { FREE: '🟢', RIDING: '🚌', DRIVING: '🚗' };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <PageTitle icon={Car} subtitle="Share your route — fare is calculated automatically.">
          Offer a Ride
        </PageTitle>
        {rideState && (
          <span className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider ring-1 ${STATUS_PILL[rideStatus]}`}>
            {STATUS_ICON[rideStatus]} {rideStatus}
          </span>
        )}
      </div>

      {/* Driver already has an active ride */}
      {activeRide && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3.5 text-sm text-amber-800 dark:border-amber-600/40 dark:bg-amber-900/20 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold">You already have an active ride published</p>
            <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400 truncate">
              {activeRide.pickup_address} → {activeRide.destination_address}
            </p>
            <p className="mt-1 text-xs">Cancel or complete your existing ride before publishing a new one.</p>
          </div>
          <Link to="/app/trips?role=driver" className="shrink-0">
            <Button variant="outline" size="sm">View my rides</Button>
          </Link>
        </div>
      )}

      {/* Driver is an active passenger on another ride */}
      {activePassTrip && !activeRide && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3.5 text-sm text-amber-800 dark:border-amber-600/40 dark:bg-amber-900/20 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold">You are currently booked as a passenger</p>
            <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400 truncate">
              {activePassTrip.pickup_address} → {activePassTrip.destination_address}
            </p>
            <p className="mt-1 text-xs">Cancel that booking before publishing a ride.</p>
          </div>
          <Link to={`/app/trips/${activePassTrip.trip_id}`} className="shrink-0">
            <Button variant="outline" size="sm">View trip</Button>
          </Link>
        </div>
      )}
      <Card className="divide-y divide-white/60">

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
              className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${form.isRecurring ? 'bg-gradient-to-r from-brand to-brand-dark shadow-glow' : 'bg-ink-200'}`}
            >
              <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${form.isRecurring ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm font-semibold text-ink-700">Recurring ride</span>
          </label>

          {form.isRecurring && (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Allowed weekdays</p>
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
                        'rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all duration-200 active:scale-95',
                        active
                          ? 'bg-gradient-to-br from-brand to-brand-dark text-white shadow-glow ring-1 ring-white/25'
                          : 'glass-input text-ink-600 hover:text-brand-dark',
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
        <div className="flex items-start gap-3 bg-brand/[0.08] px-5 py-3.5 text-sm font-medium text-brand-dark">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" strokeWidth={1.9} />
          <span>Fare per seat is calculated automatically from the admin-set rate × your route distance.</span>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3 p-5">
          {error && <div className="w-full"><Alert variant="error">{error}</Alert></div>}
          <Button variant="outline" onClick={confirmRoute} disabled={busy || !pickup || !dest}>
            <Route className="h-4 w-4" /> Confirm route
          </Button>
          <Button onClick={publish} disabled={busy || isBlocked} title={isBlocked ? 'You have an active ride — cancel it first' : ''}>
            {busy ? 'Publishing…' : 'Publish ride'}
          </Button>
        </div>
      </Card>

      {/* Route preview */}
      {route && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/60 px-5 py-3">
            <span className="text-sm font-bold text-ink-800">Route preview</span>
            <div className="flex items-center gap-2 text-xs">
              <span className="rounded-lg bg-brand/10 px-2.5 py-1 font-bold text-brand-dark ring-1 ring-brand/20">{route.distanceKm} km</span>
              <span className="rounded-lg bg-ink-100/70 px-2.5 py-1 font-bold text-ink-600 ring-1 ring-ink-200/70">~{route.durationMinutes} min</span>
              {nodes.length > 0 && (
                <span className="rounded-lg bg-orange-100 text-orange-700 px-2.5 py-1 font-bold ring-1 ring-orange-200/70">
                  🚏 {nodes.length} pickup stops
                </span>
              )}
            </div>
          </div>
          {nodes.length > 0 && (
            <div className="px-5 py-2.5 bg-orange-50 border-b border-orange-100 text-xs text-orange-700">
              <strong>Shared pickup stops</strong> have been placed along your route.
              Passengers within 5 km of any stop will see your ride.
            </div>
          )}
          <MapView
            pickup={pickup}
            destination={dest}
            routeGeometry={route.geometry}
            pickupNodes={nodes}
            height={300}
            follow={false}
          />
        </Card>
      )}
    </div>
  );
}

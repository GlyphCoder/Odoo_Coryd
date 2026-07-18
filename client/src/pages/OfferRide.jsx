import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { apiError } from '../api.js';
import AddressInput from '../components/AddressInput.jsx';
import MapView from '../components/MapView.jsx';
import { Button, Card, Input, Select, Empty, money } from '../components/ui.jsx';

export default function OfferRide() {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState(null);
  const [form, setForm] = useState({ vehicleId: '', date: '', time: '', totalSeats: 1, farePerSeat: '', isRecurring: false });
  const [pickup, setPickup] = useState(null);
  const [dest, setDest] = useState(null);
  const [route, setRoute] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/vehicles').then(({ data }) => {
      setVehicles(data.vehicles);
      if (data.vehicles[0]) setForm((f) => ({ ...f, vehicleId: data.vehicles[0].vehicle_id }));
    }).catch(() => setVehicles([]));
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

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
    if (!form.farePerSeat) return setError('Enter a fare per seat');
    setBusy(true);
    try {
      const departure = new Date(`${form.date}T${form.time}`).toISOString();
      await api.post('/rides', {
        vehicleId: form.vehicleId,
        pickupAddress: pickup.address, pickupLat: pickup.lat, pickupLng: pickup.lng,
        destinationAddress: dest.address, destinationLat: dest.lat, destinationLng: dest.lng,
        departureDatetime: departure,
        totalSeats: +form.totalSeats, farePerSeat: +form.farePerSeat,
        isRecurring: form.isRecurring,
        distanceKm: route?.distanceKm, durationMinutes: route?.durationMinutes,
      });
      navigate('/app/trips?role=driver');
    } catch (e) { setError(apiError(e)); }
    finally { setBusy(false); }
  };

  if (vehicles === null) return <div className="p-8 text-slate-500">Loading…</div>;

  if (vehicles.length === 0) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-bold text-slate-800">Offer a Ride</h1>
        <Empty title="Register a vehicle first" hint="You must add at least one vehicle before publishing rides." />
        <Link to="/app/vehicles"><Button>Add a vehicle</Button></Link>
      </div>
    );
  }

  const selected = vehicles.find((v) => v.vehicle_id === form.vehicleId);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-800">Offer a Ride</h1>
      <Card className="space-y-4 p-5">
        <Select label="Vehicle" value={form.vehicleId} onChange={set('vehicleId')}>
          {vehicles.map((v) => (
            <option key={v.vehicle_id} value={v.vehicle_id}>
              {v.vehicle_model} · {v.registration_number} · {v.seating_capacity} seats
            </option>
          ))}
        </Select>
        <AddressInput label="Pickup location" value={pickup?.address}
          onSelect={(p) => { setPickup(p); setRoute(null); }} placeholder="Where from?" />
        <AddressInput label="Destination" value={dest?.address}
          onSelect={(d) => { setDest(d); setRoute(null); }} placeholder="Where to?" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Input label="Date" type="date" value={form.date} onChange={set('date')} />
          <Input label="Time" type="time" value={form.time} onChange={set('time')} />
          <Input label="Seats" type="number" min="1" max={selected?.seating_capacity || 8} value={form.totalSeats} onChange={set('totalSeats')} />
          <Input label="Fare/seat (₹)" type="number" min="0" value={form.farePerSeat} onChange={set('farePerSeat')} />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={form.isRecurring} onChange={set('isRecurring')} /> Recurring ride
        </label>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
        <div className="flex gap-3">
          <Button variant="outline" onClick={confirmRoute} disabled={busy || !pickup || !dest}>Confirm route</Button>
          <Button onClick={publish} disabled={busy}>{busy ? 'Publishing…' : 'Publish ride'}</Button>
        </div>
      </Card>

      {route && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 text-sm">
            <span className="font-semibold text-slate-700">Route preview</span>
            <span className="text-slate-500">
              {route.distanceKm} km · ~{route.durationMinutes} min · earn up to {money((form.farePerSeat || 0) * form.totalSeats)}
            </span>
          </div>
          <MapView pickup={pickup} destination={dest} routeGeometry={route.geometry} height={300} follow={false} />
        </Card>
      )}
    </div>
  );
}

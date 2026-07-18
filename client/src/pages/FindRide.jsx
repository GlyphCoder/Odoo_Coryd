import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { apiError } from '../api.js';
import AddressInput from '../components/AddressInput.jsx';
import MapView from '../components/MapView.jsx';
import { Button, Card, Input, Badge, Empty, money } from '../components/ui.jsx';

export default function FindRide() {
  const navigate = useNavigate();
  const [pickup, setPickup] = useState(null);
  const [dest, setDest] = useState(null);
  const [date, setDate] = useState('');
  const [seats, setSeats] = useState(1);
  const [route, setRoute] = useState(null);
  const [rides, setRides] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [bookingId, setBookingId] = useState(null);

  const confirmRoute = async () => {
    if (!pickup || !dest) return setError('Select both pickup and destination');
    setError(''); setBusy(true);
    try {
      const { data } = await api.post('/geo/route', { pickup, destination: dest });
      setRoute(data);
    } catch (e) { setError(apiError(e)); }
    finally { setBusy(false); }
  };

  const search = async () => {
    setError(''); setBusy(true); setRides(null);
    try {
      const { data } = await api.get('/rides', {
        params: {
          date: date || undefined, seats,
          pickupLat: pickup?.lat, pickupLng: pickup?.lng,
          destLat: dest?.lat, destLng: dest?.lng, radiusKm: 15,
        },
      });
      setRides(data.rides);
    } catch (e) { setError(apiError(e)); }
    finally { setBusy(false); }
  };

  const book = async (rideId) => {
    setError(''); setBookingId(rideId);
    try {
      const { data } = await api.post('/bookings', { rideId, seats });
      navigate(`/app/trips/${data.trip.trip_id}`);
    } catch (e) { setError(apiError(e)); setBookingId(null); }
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-800">Find a Ride</h1>

      <Card className="space-y-4 p-5">
        <AddressInput label="Pickup location" value={pickup?.address}
          onSelect={(p) => { setPickup(p); setRoute(null); }} placeholder="Where from?" />
        <AddressInput label="Destination" value={dest?.address}
          onSelect={(d) => { setDest(d); setRoute(null); }} placeholder="Where to?" />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Travel date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input label="Seats" type="number" min="1" max="8" value={seats} onChange={(e) => setSeats(+e.target.value)} />
        </div>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
        <div className="flex gap-3">
          <Button variant="outline" onClick={confirmRoute} disabled={busy || !pickup || !dest}>Confirm route</Button>
          <Button onClick={search} disabled={busy || !pickup || !dest}>{busy ? 'Searching…' : 'Search rides'}</Button>
        </div>
      </Card>

      {route && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 text-sm">
            <span className="font-semibold text-slate-700">Route preview</span>
            <span className="text-slate-500">{route.distanceKm} km · ~{route.durationMinutes} min{route.fallback ? ' (estimated)' : ''}</span>
          </div>
          <MapView pickup={pickup} destination={dest} routeGeometry={route.geometry} height={300} follow={false} />
        </Card>
      )}

      {rides && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{rides.length} available ride(s)</h2>
          {rides.length === 0 && <Empty title="No matching rides" hint="Try widening your date or search area." />}
          {rides.map((r) => (
            <Card key={r.ride_id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800">{r.driver_name}</span>
                    <Badge status={r.status} />
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    <span className="text-brand-dark">●</span> {r.pickup_address}
                  </p>
                  <p className="text-sm text-slate-600">
                    <span className="text-rose-500">●</span> {r.destination_address}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {new Date(r.departure_datetime).toLocaleString()} · {r.vehicle_model} ({r.registration_number}) · {r.available_seats} seat(s) left
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-brand-dark">{money(r.fare_per_seat)}</div>
                  <div className="text-xs text-slate-400">per seat</div>
                  <Button className="mt-2" onClick={() => book(r.ride_id)} disabled={bookingId === r.ride_id}>
                    {bookingId === r.ride_id ? 'Booking…' : 'Book'}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

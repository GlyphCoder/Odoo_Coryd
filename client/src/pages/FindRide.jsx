import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Map, Search, ClipboardList, MapPin, ArrowRight } from 'lucide-react';
import api, { apiError } from '../api.js';
import AddressInput from '../components/AddressInput.jsx';
import MapView from '../components/MapView.jsx';
import { Button, Card, Input, Badge, Empty, money } from '../components/ui.jsx';

export default function FindRide() {
  const navigate = useNavigate();

  const [pickup, setPickup] = useState(null);
  const [dest, setDest] = useState(null);
  const [mode, setMode] = useState('now');
  const [date, setDate] = useState('');
  const [seats, setSeats] = useState(1);
  const [route, setRoute] = useState(null);
  const [rides, setRides] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [bookingId, setBookingId] = useState(null);
  const [myLocation, setMyLocation] = useState(null);

  /* Watch user's live GPS position */
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => setMyLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => { },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  /* ── Geocode a plain-text address if user typed without picking ── */
  async function resolvePoint(current, text) {
    if (current) return current;           // already has coords from dropdown
    if (!text || text.length < 3) return null;
    try {
      const { data } = await api.get('/geo/search', { params: { q: text } });
      const first = data.results?.[0];
      if (!first) return null;
      return { address: first.label, lat: first.lat, lng: first.lng };
    } catch { return null; }
  }

  /* ── Confirm route (fetch polyline from OSRM) ── */
  const [pickupText, setPickupText] = useState('');
  const [destText, setDestText] = useState('');

  const confirmRoute = async () => {
    const p = await resolvePoint(pickup, pickupText);
    const d = await resolvePoint(dest, destText);
    if (!p || !d) return setError('Select both pickup and destination');
    if (!pickup) setPickup(p);
    if (!dest) setDest(d);
    setError(''); setBusy(true);
    try {
      const { data } = await api.post('/geo/route', { pickup: p, destination: d });
      setRoute(data);
    } catch (e) { setError(apiError(e)); }
    finally { setBusy(false); }
  };

  /* ── Search available rides ── */
  const search = async () => {
    const p = await resolvePoint(pickup, pickupText);
    const d = await resolvePoint(dest, destText);
    if (!p || !d) return setError('Enter a valid pickup and destination first');
    if (mode === 'schedule' && !date) return setError('Choose a travel date for scheduled rides');
    if (!pickup) setPickup(p);
    if (!dest) setDest(d);
    setError(''); setBusy(true); setRides(null);
    try {
      const { data } = await api.get('/rides', {
        params: {
          date: mode === 'schedule' ? date : undefined,
          seats,
          pickupLat: p.lat, pickupLng: p.lng,
          destLat: d.lat, destLng: d.lng,
          radiusKm: 15,
        },
      });
      setRides(data.rides);
    } catch (e) { setError(apiError(e)); }
    finally { setBusy(false); }
  };

  /* ── Book a ride ── */
  const book = async (rideId) => {
    setError(''); setBookingId(rideId);
    try {
      const { data } = await api.post('/bookings', { rideId, seats });
      navigate(`/app/trips/${data.trip.trip_id}`);
    } catch (e) { setError(apiError(e)); setBookingId(null); }
  };

  /* Allow buttons as long as either text or coords exist */
  const canSearch = (pickup || pickupText.length >= 3) && (dest || destText.length >= 3);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-800">Find a Ride</h1>

      <Card className="space-y-4 p-5">
        <AddressInput
          label="Pickup location"
          value={pickup?.address}
          placeholder="Where from?"
          onSelect={(p) => {
            setPickup(p);
            setPickupText(p?.address || '');
            setRoute(null);
          }}
        />
        <AddressInput
          label="Destination"
          value={dest?.address}
          placeholder="Where to?"
          onSelect={(d) => {
            setDest(d);
            setDestText(d?.address || '');
            setRoute(null);
          }}
        />
        <div className="flex flex-wrap gap-2">
          {[
            { value: 'now', label: 'Pickup now' },
            { value: 'schedule', label: 'Schedule' },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setMode(option.value)}
              className={`rounded-full border px-3 py-1.5 text-sm ${mode === option.value ? 'border-brand-dark bg-brand-dark text-white' : 'border-slate-200 bg-white text-slate-600'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Travel date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={mode === 'now'}
          />
          <Input
            label="Seats"
            type="number"
            min="1"
            max="8"
            value={seats}
            onChange={(e) => setSeats(+e.target.value)}
          />
        </div>

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>
        )}

        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={confirmRoute}
            disabled={busy || !canSearch}
          >
            <Map className="h-4 w-4" /> Confirm route
          </Button>
          <Button
            onClick={search}
            disabled={busy || !canSearch}
            id="search-rides-btn"
          >
            {busy ? 'Searching…' : <><Search className="h-4 w-4" /> Search</>}
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              setError(''); setBusy(true); setRides(null);
              try {
                const { data } = await api.get('/rides', { params: { seats } });
                setRides(data.rides);
              } catch (e) { setError(apiError(e)); }
              finally { setBusy(false); }
            }}
            disabled={busy}
          >
            <ClipboardList className="h-4 w-4" /> Browse all rides
          </Button>
        </div>
      </Card>

      {/* Live location + route preview map */}
      {(route || myLocation) && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 text-sm">
            <span className="font-semibold text-slate-700">
              {route ? 'Route preview' : 'Your location'}
            </span>
            {route && (
              <span className="text-slate-500">
                {route.distanceKm} km · ~{route.durationMinutes} min
                {route.fallback ? ' (estimated)' : ''}
              </span>
            )}
            {!route && myLocation && (
              <span className="flex items-center gap-1.5 text-blue-500">
                <span className="inline-block h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                Live location
              </span>
            )}
          </div>
          <MapView
            pickup={pickup}
            destination={dest}
            routeGeometry={route?.geometry}
            myLocation={myLocation}
            height={320}
            follow={false}
          />
        </Card>
      )}

      {/* Search results */}
      {rides && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            {rides.length} available ride(s)
          </h2>
          {rides.length === 0 && (
            <Empty title="No matching rides" hint="Try widening your date or search area." />
          )}
          {rides.map((r) => (
            <Card key={r.ride_id} className="p-4 transition hover:shadow-md">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800">{r.driver_name}</span>
                    <Badge status={r.status} />
                  </div>
                  {/* Route: pickup → destination in one line */}
                  <div className="mt-1 flex min-w-0 items-center gap-1.5 overflow-hidden text-sm text-slate-600">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-brand" />
                    <span className="flex-1 min-w-0 truncate">{r.pickup_address}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-rose-500" />
                    <span className="flex-1 min-w-0 truncate">{r.destination_address}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {new Date(r.departure_datetime).toLocaleString()} ·{' '}
                    {r.vehicle_model} ({r.registration_number}) ·{' '}
                    {r.available_seats} seat(s) left
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-brand-dark">{money(r.fare_per_seat)}</div>
                  <div className="text-xs text-slate-400">per seat</div>
                  <Button
                    className="mt-2"
                    onClick={() => book(r.ride_id)}
                    disabled={bookingId === r.ride_id}
                  >
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

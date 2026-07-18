import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Map, Search, ClipboardList, MapPin, ArrowRight, Navigation, Armchair, CalendarClock, AlertTriangle } from 'lucide-react';
import api, { apiError } from '../api.js';
import AddressInput from '../components/AddressInput.jsx';
import MapView from '../components/MapView.jsx';
import {
  Button, Card, Input, Badge, Empty, Alert, PageTitle,
  Pagination, usePagination, money,
} from '../components/ui.jsx';

const PER_PAGE = 5;

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
  const [searchId, setSearchId] = useState(0);   // bumps on each new search → resets pagination

  /* Paginate the result set */
  const pager = usePagination(rides, PER_PAGE, searchId);

  // For map preview: which ride is hovered and its nodes
  const [previewRide, setPreviewRide] = useState(null);
  const [previewNodes, setPreviewNodes] = useState([]);

  // Current ride state for this user
  const [rideState, setRideState] = useState(null);
  const [cancelBusy, setCancelBusy] = useState(false);

  // Fetch user state on mount
  useEffect(() => {
    api.get('/rides/state').then(({ data }) => setRideState(data)).catch(() => {});
  }, []);

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
  const [pickupText, setPickupText] = useState('');
  const [destText, setDestText] = useState('');

  async function resolvePoint(current, text) {
    if (current) return current;
    if (!text || text.length < 3) return null;
    try {
      const { data } = await api.get('/geo/search', { params: { q: text } });
      const first = data.results?.[0];
      if (!first) return null;
      return { address: first.label, lat: first.lat, lng: first.lng };
    } catch { return null; }
  }

  /* ── Confirm route (fetch polyline from OSRM) ── */
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

  /* ── Search available rides (node-aware) ── */
  const search = async () => {
    const p = await resolvePoint(pickup, pickupText);
    const d = await resolvePoint(dest, destText);
    if (!p || !d) return setError('Enter a valid pickup and destination first');
    if (mode === 'schedule' && !date) return setError('Choose a travel date for scheduled rides');
    if (!pickup) setPickup(p);
    if (!dest) setDest(d);
    setError(''); setBusy(true); setRides(null); setPreviewRide(null);
    try {
      const { data } = await api.get('/rides', {
        params: {
          date: mode === 'schedule' ? date : undefined,
          seats,
          pickupLat: p.lat, pickupLng: p.lng,
          // destLat/destLng removed — node system replaces dest matching
        },
      });
      setRides(data.rides);
      setSearchId((n) => n + 1);
    } catch (e) { setError(apiError(e)); }
    finally { setBusy(false); }
  };

  const browseAll = async () => {
    setError(''); setBusy(true); setRides(null);
    try {
      const { data } = await api.get('/rides', { params: { seats } });
      setRides(data.rides);
      setSearchId((n) => n + 1);
    } catch (e) { setError(apiError(e)); }
    finally { setBusy(false); }
  };

  /* ── Book a ride — send pickupNodeId ── */
  const book = async (ride) => {
    if (!ride.nearest_node) {
      return setError('No pickup node found for this ride. Please search with your location first.');
    }
    setError(''); setBookingId(ride.ride_id);
    try {
      const { data } = await api.post('/bookings', {
        rideId: ride.ride_id,
        seats,
        pickupNodeId: ride.nearest_node.node_id,
        // Include current location for server-side validation if available
        ...(myLocation ? { passengerLat: myLocation.lat, passengerLng: myLocation.lng } : {}),
      });
      navigate(`/app/trips/${data.trip.trip_id}`);
    } catch (e) { setError(apiError(e)); setBookingId(null); }
  };

  /* ── Fetch nodes for a ride (for map preview) ── */
  const showOnMap = async (ride) => {
    setPreviewRide(ride);
    try {
      const { data } = await api.get(`/rides/${ride.ride_id}/nodes`);
      setPreviewNodes(data.nodes || []);
    } catch { setPreviewNodes([]); }
  };

  const rideStatus   = rideState?.rideStatus ?? 'FREE';
  const activeTrip   = rideState?.asPassenger;
  const activeRide   = rideState?.asDriver;
  const isBlocked    = rideStatus !== 'FREE';
  const canSearch    = !isBlocked && (pickup || pickupText.length >= 3) && (dest || destText.length >= 3);

  /* Cancel own booking (passenger) */
  const cancelMyBooking = async () => {
    if (!activeTrip?.booking_id) return;
    setCancelBusy(true);
    try {
      await api.patch(`/bookings/${activeTrip.booking_id}/cancel`);
      setRideState((s) => ({ ...s, rideStatus: 'FREE', asPassenger: null }));
    } catch (e) { setError(apiError(e)); }
    finally { setCancelBusy(false); }
  };

  /* Status pill styles */
  const STATUS_STYLES = {
    FREE:    'bg-emerald-100 text-emerald-700 border-emerald-300',
    RIDING:  'bg-amber-100 text-amber-700 border-amber-300',
    DRIVING: 'bg-blue-100 text-blue-700 border-blue-300',
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <PageTitle icon={Search} subtitle="Search rides published by colleagues on your route.">
          Find a Ride
        </PageTitle>
        {rideState && (
          <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold tracking-wide ${STATUS_STYLES[rideStatus]}`}>
            {rideStatus}
          </span>
        )}
      </div>

      {/* RIDING — already booked as passenger */}
      {rideStatus === 'RIDING' && activeTrip && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3.5 text-sm text-amber-800 dark:border-amber-600/40 dark:bg-amber-900/20 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold">Status: RIDING — you are booked on an active ride</p>
            <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400 truncate">
              {activeTrip.pickup_address} → {activeTrip.destination_address}
            </p>
            <p className="mt-1 text-xs">Cancel your booking to search for a different ride.</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Link to={`/app/trips/${activeTrip.trip_id}`}>
              <Button variant="outline" size="sm">View trip</Button>
            </Link>
            <Button size="sm" variant="danger" onClick={cancelMyBooking} disabled={cancelBusy || activeTrip.status !== 'BOOKED'}>
              {cancelBusy ? 'Cancelling…' : 'Cancel booking'}
            </Button>
          </div>
        </div>
      )}

      {/* DRIVING — user has an active ride as driver */}
      {rideStatus === 'DRIVING' && activeRide && (
        <div className="flex items-start gap-3 rounded-xl border border-blue-300 bg-blue-50 px-4 py-3.5 text-sm text-blue-800 dark:border-blue-600/40 dark:bg-blue-900/20 dark:text-blue-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold">Status: DRIVING — you have an active ride published</p>
            <p className="mt-0.5 text-xs text-blue-600 dark:text-blue-400 truncate">
              {activeRide.pickup_address} → {activeRide.destination_address}
            </p>
            <p className="mt-1 text-xs">Cancel your ride before booking a seat on another.</p>
          </div>
          <Link to="/app/trips?role=driver" className="shrink-0">
            <Button variant="outline" size="sm">View my ride</Button>
          </Link>
        </div>
      )}

      <Card className="space-y-4 p-5">
        <AddressInput
          label="Pickup location"
          value={pickup?.address}
          placeholder="Where from?"
          onSelect={(p) => { setPickup(p); setPickupText(p?.address || ''); setRoute(null); }}
        />
        <AddressInput
          label="Destination"
          value={dest?.address}
          placeholder="Where to?"
          onSelect={(d) => { setDest(d); setDestText(d?.address || ''); setRoute(null); }}
        />

        <div className="flex flex-wrap gap-2">
          {[{ value: 'now', label: 'Pickup now' }, { value: 'schedule', label: 'Schedule' }].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setMode(option.value)}
              className={[
                'rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-200 active:scale-95',
                mode === option.value
                  ? 'bg-gradient-to-br from-brand to-brand-dark text-white shadow-glow ring-1 ring-white/25'
                  : 'glass-input text-ink-600 hover:text-brand-dark',
              ].join(' ')}
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
            className={mode === 'now' ? 'opacity-50' : ''}
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

        {/* Node system info banner */}
        <div className="flex items-start gap-2 rounded-lg bg-orange-50 border border-orange-200 px-3 py-2.5 text-sm text-orange-700">
          <Navigation className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
          <span>
            <strong>Smart pickup:</strong> Rides are matched to shared stops within 5 km of your location along the driver's route.
          </span>
        </div>

        {error && <Alert variant="error">{error}</Alert>}

        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={confirmRoute} disabled={busy || !canSearch}>
            <Map className="h-4 w-4" /> Confirm route
          </Button>
          <Button onClick={search} disabled={busy || !canSearch} id="search-rides-btn">
            {busy ? 'Searching…' : <><Search className="h-4 w-4" /> Search</>}
          </Button>
          <Button variant="ghost" onClick={browseAll} disabled={busy}>
            <ClipboardList className="h-4 w-4" /> Browse all rides
          </Button>
        </div>
      </Card>

      {/* Route / map preview */}
      {(route || myLocation || previewRide) && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 text-sm">
            <span className="font-bold text-ink-700">
              {previewRide ? `Route: ${previewRide.driver_name}` : route ? 'Route preview' : 'Your location'}
            </span>
            {route && !previewRide && (
              <span className="rounded-lg bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand-dark">
                {route.distanceKm} km · ~{route.durationMinutes} min
                {route.fallback ? ' (estimated)' : ''}
              </span>
            )}
            {!route && myLocation && !previewRide && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-brand">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-brand" />
                Live location
              </span>
            )}
            {previewRide?.nearest_node && (
              <span className="flex items-center gap-1.5 text-orange-600 text-xs font-medium">
                <span className="inline-block h-2 w-2 rounded-full bg-orange-500" />
                Your stop: #{previewRide.nearest_node.node_index + 1} ({previewRide.nearest_node.distance_km.toFixed(1)} km away)
              </span>
            )}
          </div>
          <MapView
            pickup={previewRide ? { lat: +previewRide.pickup_lat, lng: +previewRide.pickup_lng, address: previewRide.pickup_address } : pickup}
            destination={previewRide ? { lat: +previewRide.destination_lat, lng: +previewRide.destination_lng, address: previewRide.destination_address } : dest}
            routeGeometry={previewRide ? previewRide.route_polyline : route?.geometry}
            myLocation={myLocation}
            pickupNodes={previewNodes}
            selectedNodeId={previewRide?.nearest_node?.node_id}
            height={320}
            follow={false}
          />
        </Card>
      )}

      {/* Search results */}
      {rides && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest text-ink-500">
              {pager.total} ride{pager.total === 1 ? '' : 's'} with nearby pickup stops
            </h2>
          </div>

          {pager.total === 0 ? (
            <Empty
              icon={Search}
              title="No rides within 5 km"
              hint="No shared pickup stops found within 5 km. Try browsing all rides or searching a different area."
            />
          ) : (
            <>
              {/* Top pager */}
              <Pagination {...pager} label="rides" />

              {pager.items.map((r) => (
                <Card
                  key={r.ride_id}
                  className={`p-4 cursor-pointer ${previewRide?.ride_id === r.ride_id ? 'ring-2 ring-brand' : ''}`}
                  hover
                  onClick={() => showOnMap(r)}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-ink-800">{r.driver_name}</span>
                        <Badge status={r.status} />
                      </div>

                      {/* Route: pickup → destination */}
                      <div className="mt-2 flex min-w-0 items-center gap-1.5 overflow-hidden text-sm text-ink-600">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-brand" />
                        <span className="min-w-0 flex-1 truncate">{r.pickup_address}</span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-400" />
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-brand-dark" />
                        <span className="min-w-0 flex-1 truncate">{r.destination_address}</span>
                      </div>

                      {/* Nearest pickup node callout */}
                      {r.nearest_node && (
                        <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-orange-50 border border-orange-200 px-2.5 py-1.5 text-xs text-orange-700">
                          <span className="inline-block h-2 w-2 rounded-full bg-orange-400 shrink-0" />
                          <span className="font-semibold">Your pickup stop #{r.nearest_node.node_index + 1}</span>
                          {r.nearest_node.address && (
                            <span className="truncate text-orange-600">— {r.nearest_node.address}</span>
                          )}
                          <span className="ml-auto shrink-0 text-orange-500 font-medium">
                            {r.nearest_node.distance_km.toFixed(1)} km away
                          </span>
                        </div>
                      )}

                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-400">
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="h-3 w-3" /> {new Date(r.departure_datetime).toLocaleString()}
                        </span>
                        <span>{r.vehicle_model} ({r.registration_number})</span>
                        <span className="inline-flex items-center gap-1">
                          <Armchair className="h-3 w-3" /> {r.available_seats} seat(s) left
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-lg font-extrabold text-brand-dark">{money(r.fare_per_seat)}</div>
                      <div className="text-xs text-ink-400">per seat</div>
                      <Button
                        className="mt-2"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); book(r); }}
                        disabled={bookingId === r.ride_id || !r.nearest_node}
                        title={!r.nearest_node ? 'Search with your location to get a pickup stop' : ''}
                      >
                        {bookingId === r.ride_id ? 'Booking…' : 'Book'}
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}

              {/* Bottom pager */}
              <Pagination {...pager} label="rides" />
            </>
          )}
        </div>
      )}
    </div>
  );
}

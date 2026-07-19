import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Map, Search, ClipboardList, MapPin, ArrowRight, Navigation, Armchair, CalendarClock, AlertTriangle, CheckCircle2, X } from 'lucide-react';
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
  const [searchId, setSearchId] = useState(0);
  const [bookedInfo, setBookedInfo] = useState(null); // triggers success modal
  const autoNavTimer = useRef(null);

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
        ...(myLocation ? { passengerLat: myLocation.lat, passengerLng: myLocation.lng } : {}),
      });
      // Show success modal instead of immediately navigating
      setBookedInfo({ trip: data.trip, ride, booking: data.booking });
      setRideState((s) => ({ ...s, rideStatus: 'RIDING' }));
      // Auto-navigate after 4 seconds
      autoNavTimer.current = setTimeout(() => {
        navigate(`/app/trips/${data.trip.trip_id}`);
      }, 4000);
    } catch (e) { setError(apiError(e)); setBookingId(null); }
  };

  /* Dismiss modal and navigate */
  const goToTrip = () => {
    clearTimeout(autoNavTimer.current);
    if (bookedInfo) navigate(`/app/trips/${bookedInfo.trip.trip_id}`);
  };

  // Cleanup timer on unmount
  useEffect(() => () => clearTimeout(autoNavTimer.current), []);

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

      {/* ═══ BOOKING SUCCESS MODAL ═══════════════════════════════════════ */}
      {bookedInfo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
        >
          <div
            className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900"
            style={{ animation: 'slideUp 0.35s cubic-bezier(0.34,1.56,0.64,1)' }}
          >
            {/* Green success header */}
            <div className="flex flex-col items-center gap-3 bg-gradient-to-br from-emerald-500 to-green-600 px-6 pt-8 pb-6 text-white">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 ring-4 ring-white/30">
                <CheckCircle2 className="h-9 w-9 text-white" />
              </span>
              <h2 className="text-2xl font-extrabold tracking-tight">Ride Booked! 🎉</h2>
              <p className="text-sm text-emerald-100">Your seat is confirmed</p>
            </div>

            {/* Countdown bar */}
            <div className="h-1 w-full bg-emerald-100">
              <div
                className="h-full bg-emerald-500"
                style={{ animation: 'shrinkBar 4s linear forwards' }}
              />
            </div>

            {/* Details */}
            <div className="space-y-3 px-6 py-5">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Driver</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{bookedInfo.ride.driver_name}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Vehicle</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {bookedInfo.ride.vehicle_model} · {bookedInfo.ride.registration_number}
                </span>
              </div>
              {bookedInfo.ride.nearest_node && (
                <div className="flex items-start gap-2 rounded-xl bg-orange-50 px-4 py-3 dark:bg-orange-900/20">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wider text-orange-400">Your Pickup Stop</p>
                    <p className="text-sm font-semibold text-orange-800 dark:text-orange-300">
                      Stop #{bookedInfo.ride.nearest_node.node_index + 1}
                      {bookedInfo.ride.nearest_node.address ? ` — ${bookedInfo.ride.nearest_node.address}` : ''}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Departure</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {new Date(bookedInfo.ride.departure_datetime).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Seats · Fare</span>
                <span className="font-bold text-brand-dark">
                  {seats} seat{seats > 1 ? 's' : ''} · {money(bookedInfo.ride.fare_per_seat * seats)}
                </span>
              </div>
            </div>

            <p className="px-6 pb-2 text-center text-xs text-slate-400">Redirecting to your trip in 4 seconds…</p>

            {/* CTAs */}
            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={() => setBookedInfo(null)}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400"
              >
                Stay here
              </button>
              <button
                onClick={goToTrip}
                className="flex-1 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 py-2.5 text-sm font-bold text-white shadow-lg hover:opacity-90 active:scale-95 transition-all"
              >
                View Trip →
              </button>
            </div>

            {/* Close X */}
            <button
              onClick={() => setBookedInfo(null)}
              className="absolute right-4 top-4 rounded-full p-1.5 text-white/70 hover:bg-white/20"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Keyframe styles */}
          <style>{`
            @keyframes slideUp {
              from { opacity: 0; transform: translateY(40px) scale(0.96); }
              to   { opacity: 1; transform: translateY(0)    scale(1); }
            }
            @keyframes shrinkBar {
              from { width: 100%; }
              to   { width: 0%; }
            }
          `}</style>
        </div>
      )}

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
        <div className="flex items-start gap-3 rounded-xl border border-amber-400 bg-amber-500 px-4 py-3.5 text-sm text-white shadow-lg">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-white" />
          <div className="flex-1 min-w-0">
            <p className="font-bold">Status: RIDING — you are booked on an active ride</p>
            <p className="mt-0.5 text-xs text-amber-100 truncate">
              {activeTrip.pickup_address} → {activeTrip.destination_address}
            </p>
            <p className="mt-1 text-xs text-amber-100">Cancel your booking to search for a different ride.</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Link to={`/app/trips/${activeTrip.trip_id}`}>
              <Button variant="outline" size="sm" className="border-white/50 text-white hover:bg-white/20">View trip</Button>
            </Link>
            <Button size="sm" variant="danger" onClick={cancelMyBooking} disabled={cancelBusy || activeTrip.status !== 'BOOKED'}>
              {cancelBusy ? 'Cancelling…' : 'Cancel booking'}
            </Button>
          </div>
        </div>
      )}

      {/* DRIVING — user has an active ride as driver */}
      {rideStatus === 'DRIVING' && activeRide && (
        <div className="flex items-start gap-3 rounded-xl border border-blue-500 bg-blue-600 px-4 py-3.5 text-sm text-white shadow-lg">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-white" />
          <div className="flex-1 min-w-0">
            <p className="font-bold">Status: DRIVING — you have an active ride published</p>
            <p className="mt-0.5 text-xs text-blue-100 truncate">
              {activeRide.pickup_address} → {activeRide.destination_address}
            </p>
            <p className="mt-1 text-xs text-blue-100">Cancel your ride before booking a seat on another.</p>
          </div>
          <Link to="/app/trips?role=driver" className="shrink-0">
            <Button variant="outline" size="sm" className="border-white/50 text-white hover:bg-white/20">View my ride</Button>
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
        <div className="flex items-start gap-2 rounded-lg border border-brand/40 bg-brand/15 px-3 py-2.5 text-sm text-brand-dark">
          <Navigation className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
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

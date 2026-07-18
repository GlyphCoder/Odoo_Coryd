import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plus, Compass, Wallet, ArrowRight, Bookmark, Clock, MapPin } from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Logo } from '../components/Brand.jsx';
import { Card, Spinner, money, Badge } from '../components/ui.jsx';

function Stat({ label, value }) {
  return (
    <Card variant="hero" className="p-5" hover>
      <div className="text-2xl font-extrabold tracking-tight text-ink-900">{value}</div>
      <div className="mt-1 text-[11px] font-bold uppercase tracking-wider text-ink-400">{label}</div>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats]       = useState(null);
  const [upcoming, setUpcoming] = useState(null);
  const [places, setPlaces]     = useState([]);
  const [rideState, setRideState] = useState(null);

  useEffect(() => {
    // Load stats
    api.get('/reports/me')
      .then(({ data }) => setStats(data))
      .catch(() => setStats({ error: true }));

    // Load active/offered rides
    api.get('/rides/mine')
      .then(({ data }) => setUpcoming(data.rides.slice(0, 3)))
      .catch(() => setUpcoming([]));

    // Load saved places
    api.get('/saved-places')
      .then(({ data }) => setPlaces(data.places.slice(0, 3)))
      .catch(() => setPlaces([]));

    // Load ride state (FREE / RIDING / DRIVING)
    api.get('/rides/state')
      .then(({ data }) => setRideState(data))
      .catch(() => {});
  }, []);

  const rideStatus = rideState?.rideStatus ?? 'FREE';
  const STATUS_PILL = {
    FREE:    'bg-emerald-100 text-emerald-700 border-emerald-300 ring-emerald-200',
    RIDING:  'bg-amber-100 text-amber-700 border-amber-300 ring-amber-200',
    DRIVING: 'bg-blue-100 text-blue-700 border-blue-300 ring-blue-200',
  };
  const STATUS_ICON = { FREE: '🟢', RIDING: '🚌', DRIVING: '🚗' };


  return (
    <div className="space-y-6">

      {/* Greeting Header */}
      <div className="glass flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Logo size="lg" />
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">
              Hi, {user?.fullName?.split(' ')[0]} 👋
            </h1>
            <p className="text-sm text-ink-500">Welcome to your enterprise commute portal.</p>
          </div>
        </div>
        <span className="hidden rounded-xl bg-brand/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-brand-dark ring-1 ring-brand/20 sm:inline-flex items-center gap-2">
          {user?.orgName}
        </span>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider ring-1 ${STATUS_PILL[rideStatus]}`}>
          {STATUS_ICON[rideStatus]} {rideStatus}
        </span>
      </div>

      {/* Main 12-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">

        {/* Left Side: CTAs & Stats (8/12 cols) */}
        <div className="space-y-6 lg:col-span-8">

          {/* Primary Hero CTAs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

            {/* Find a Ride */}
            <Link to="/app/find" id="quick-find-ride" className="block">
              <div className="glass-violet group relative overflow-hidden rounded-[20px] p-6 text-white transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_50px_-12px_rgba(59,7,100,0.45)] active:scale-[0.98]">
                <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/15 blur-xl" />
                <div className="pointer-events-none absolute -bottom-6 -right-2 h-20 w-20 rounded-full bg-white/10 blur-lg" />
                <div className="glass-body">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 ring-1 ring-white/25">
                    <Search className="h-5 w-5" strokeWidth={2} />
                  </span>
                  <div className="mt-4 text-xl font-extrabold leading-tight">Find a Ride</div>
                  <div className="mt-1 text-sm text-white/75">Search available rides near you</div>
                  <div className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-white/20 px-3.5 py-1.5 text-xs font-bold ring-1 ring-white/25 transition-colors group-hover:bg-white/30">
                    Book now <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>
              </div>
            </Link>

            {/* Offer a Ride */}
            <Link to="/app/offer" id="quick-offer-ride" className="block">
              <div className="group relative overflow-hidden rounded-[20px] border border-white/20 bg-gradient-to-br from-ink-800 to-ink-900 p-6 text-white shadow-[0_8px_32px_rgba(27,27,38,0.32),inset_0_1px_0_rgba(255,255,255,0.15)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_50px_-12px_rgba(27,27,38,0.5)] active:scale-[0.98]">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent" />
                <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-brand/30 blur-xl" />
                <div className="pointer-events-none absolute -bottom-6 -right-2 h-20 w-20 rounded-full bg-brand/20 blur-lg" />
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
                  <Plus className="h-5 w-5" strokeWidth={2} />
                </span>
                <div className="mt-4 text-xl font-extrabold leading-tight">Offer a Ride</div>
                <div className="mt-1 text-sm text-white/70">Share your route with colleagues</div>
                <div className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-3.5 py-1.5 text-xs font-bold ring-1 ring-white/20 transition-colors group-hover:bg-white/25">
                  Publish route <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </div>
            </Link>

          </div>

          {/* Stats Sections */}
          {!stats ? (
            <Card className="flex h-36 items-center justify-center">
              <Spinner label="Loading dashboard statistics…" />
            </Card>
          ) : stats.error ? null : (
            <div className="space-y-6">

              {/* As Driver */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Compass className="h-4 w-4 text-brand" />
                  <h2 className="text-[11px] font-bold uppercase tracking-widest text-ink-500">Driver Summary</h2>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="Trips" value={stats.asDriver.trips} />
                  <Stat label="Distance" value={`${Number(stats.asDriver.distance).toFixed(0)} km`} />
                  <Stat label="Earned" value={money(stats.asDriver.earned)} />
                  <Stat label="Fuel Cost" value={money(stats.asDriver.fuel_cost)} />
                </div>
              </div>

              {/* As Passenger */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-brand" />
                  <h2 className="text-[11px] font-bold uppercase tracking-widest text-ink-500">Passenger Summary</h2>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="Trips" value={stats.asPassenger.trips} />
                  <Stat label="Distance" value={`${Number(stats.asPassenger.distance).toFixed(0)} km`} />
                  <Stat label="Spent" value={money(stats.asPassenger.spent)} />
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Right Side: Quick Lists & Activity Widget (4/12 cols) */}
        <div className="space-y-6 lg:col-span-4">

          {/* Card: Upcoming Offered Rides */}
          <Card className="flex min-h-[220px] flex-col p-5">
            <div className="flex items-center justify-between border-b border-white/60 pb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-brand" />
                <h3 className="font-bold text-ink-800">Your Active Offers</h3>
              </div>
              <Link to="/app/trips" className="text-xs font-bold text-brand-dark transition hover:text-brand hover:underline">
                View all
              </Link>
            </div>

            <div className="mt-3 flex-1">
              {!upcoming ? (
                <div className="py-6 text-center text-xs text-ink-400">Loading offers…</div>
              ) : upcoming.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center text-xs text-ink-400">
                  <p>No active ride offers.</p>
                  <Link to="/app/offer" className="mt-2 text-xs font-bold text-brand transition hover:underline">
                    Publish one now
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {upcoming.map((r) => (
                    <div key={r.ride_id} className="glass-hover rounded-xl border border-white/60 bg-white/40 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-ink-600">
                          {new Date(r.departure_datetime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {r.departure_time}
                        </span>
                        <Badge status={r.status} />
                      </div>
                      <div className="mt-1.5 flex items-center gap-1 text-[11px] text-ink-500">
                        <span className="max-w-[90px] truncate">{r.pickup_address}</span>
                        <ArrowRight className="h-3 w-3 shrink-0 text-brand" />
                        <span className="max-w-[90px] truncate">{r.destination_address}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* Card: Quick Saved Places */}
          <Card className="flex min-h-[220px] flex-col p-5">
            <div className="flex items-center justify-between border-b border-white/60 pb-3">
              <div className="flex items-center gap-2">
                <Bookmark className="h-4 w-4 text-brand" />
                <h3 className="font-bold text-ink-800">Saved Places</h3>
              </div>
              <Link to="/app/places" className="text-xs font-bold text-brand-dark transition hover:text-brand hover:underline">
                Manage
              </Link>
            </div>

            <div className="mt-3 flex-1">
              {places.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-xs text-ink-400">
                  <p>No saved places yet.</p>
                  <Link to="/app/places" className="mt-2 text-xs font-bold text-brand transition hover:underline">
                    Add places
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {places.map((p) => (
                    <div key={p.place_id} className="glass-hover flex items-center gap-2.5 rounded-xl border border-white/60 bg-white/40 p-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/12 text-brand ring-1 ring-brand/15">
                        <MapPin className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-ink-700">{p.label}</div>
                        <div className="truncate text-[10px] text-ink-400">{p.address_text}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

        </div>

      </div>
    </div>
  );
}

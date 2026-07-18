import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plus, Compass, Wallet, ArrowRight, Bookmark, Clock, MapPin, Sparkles } from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Card, Spinner, money, Empty, Badge } from '../components/ui.jsx';

function Stat({ label, value }) {
  return (
    <Card className="p-5 shadow-card hover:shadow-card-hover transition-all duration-200">
      <div className="text-2xl font-extrabold text-slate-800 tracking-tight">{value}</div>
      <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</div>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [upcoming, setUpcoming] = useState(null);
  const [places, setPlaces] = useState([]);

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
  }, []);

  return (
    <div className="space-y-6">
      
      {/* Greeting Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Hi, {user?.fullName?.split(' ')[0]} <span className="animate-pulse">👋</span>
          </h1>
          <p className="text-sm text-slate-500">Welcome to your enterprise commute portal.</p>
        </div>
      </div>

      {/* Main 12-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        
        {/* Left Side: CTAs & Stats (8/12 cols) */}
        <div className="space-y-6 lg:col-span-8">
          
          {/* Primary Hero CTAs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            
            {/* Find a Ride */}
            <Link to="/app/find" id="quick-find-ride" className="block">
              <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand to-brand-dark p-6 text-white shadow-card hover:shadow-card-hover transition-all duration-200 active:scale-[0.98]">
                <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/10" />
                <div className="absolute -right-2 -bottom-4 h-16 w-16 rounded-full bg-white/10" />
                <Search className="h-8 w-8 opacity-95" strokeWidth={1.75} />
                <div className="mt-4 text-xl font-bold leading-tight">Find a Ride</div>
                <div className="mt-1 text-sm text-white/80">Search available rides near you</div>
                <div className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-white/20 px-3.5 py-1.5 text-xs font-bold backdrop-blur transition-colors group-hover:bg-white/30">
                  Book now <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </div>
            </Link>

            {/* Offer a Ride */}
            <Link to="/app/offer" id="quick-offer-ride" className="block">
              <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-6 text-white shadow-card hover:shadow-card-hover transition-all duration-200 active:scale-[0.98]">
                <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/10" />
                <div className="absolute -right-2 -bottom-4 h-16 w-16 rounded-full bg-white/10" />
                <Plus className="h-8 w-8 opacity-95" strokeWidth={1.75} />
                <div className="mt-4 text-xl font-bold leading-tight">Offer a Ride</div>
                <div className="mt-1 text-sm text-white/80">Share your route with colleagues</div>
                <div className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-white/20 px-3.5 py-1.5 text-xs font-bold backdrop-blur transition-colors group-hover:bg-white/30">
                  Publish route <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </div>
            </Link>

          </div>

          {/* Stats Sections */}
          {!stats ? (
            <div className="flex h-36 items-center justify-center rounded-2xl border border-slate-100 bg-white shadow-card">
              <Spinner label="Loading dashboard statistics…" />
            </div>
          ) : stats.error ? null : (
            <div className="space-y-6">
              
              {/* As Driver */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Compass className="h-4.5 w-4.5 text-brand" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Driver Summary</h2>
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
                  <Wallet className="h-4.5 w-4.5 text-brand" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Passenger Summary</h2>
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
          <Card className="p-5 shadow-card flex flex-col min-h-[220px]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4.5 w-4.5 text-slate-400" />
                <h3 className="font-semibold text-slate-800">Your Active Offers</h3>
              </div>
              <Link to="/app/trips" className="text-xs font-semibold text-brand hover:underline">
                View all
              </Link>
            </div>
            
            <div className="mt-3 flex-1">
              {!upcoming ? (
                <div className="py-6 text-center text-xs text-slate-400">Loading offers…</div>
              ) : upcoming.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center text-xs text-slate-400">
                  <p>No active ride offers.</p>
                  <Link to="/app/offer" className="mt-2 text-xs font-bold text-brand hover:underline">
                    Publish one now
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {upcoming.map((r) => (
                    <div key={r.ride_id} className="rounded-xl border border-slate-100 p-3 hover:bg-slate-50 transition duration-150">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-600">
                          {new Date(r.departure_datetime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {r.departure_time}
                        </span>
                        <Badge status={r.status} />
                      </div>
                      <div className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-500">
                        <span className="truncate max-w-[90px]">{r.pickup_address}</span>
                        <ArrowRight className="h-3 w-3 shrink-0" />
                        <span className="truncate max-w-[90px]">{r.destination_address}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* Card: Quick Saved Places */}
          <Card className="p-5 shadow-card flex flex-col min-h-[220px]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Bookmark className="h-4.5 w-4.5 text-slate-400" />
                <h3 className="font-semibold text-slate-800">Saved Places</h3>
              </div>
              <Link to="/app/places" className="text-xs font-semibold text-brand hover:underline">
                Manage
              </Link>
            </div>
            
            <div className="mt-3 flex-1">
              {places.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-xs text-slate-400">
                  <p>No saved places yet.</p>
                  <Link to="/app/places" className="mt-2 text-xs font-bold text-brand hover:underline">
                    Add places
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {places.map((p) => (
                    <div key={p.place_id} className="flex items-center gap-2.5 rounded-xl border border-slate-100 p-2.5 hover:bg-slate-50 transition duration-150">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                        <MapPin className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-700">{p.label}</div>
                        <div className="truncate text-[10px] text-slate-400">{p.address_text}</div>
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

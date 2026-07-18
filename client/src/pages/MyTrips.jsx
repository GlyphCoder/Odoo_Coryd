import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Car, ClipboardList, RefreshCw, Armchair, MapPin, Clock, ArrowRight } from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Card, Badge, Button, Empty, Spinner, money } from '../components/ui.jsx';

const tabs = [
  { key: 'offered',   label: 'Offered Rides',  Icon: Car },
  { key: 'all',       label: 'All Trips',       Icon: ClipboardList },
  { key: 'driver',    label: 'As Driver',       Icon: null },
  { key: 'passenger', label: 'As Passenger',    Icon: null },
];

export default function MyTrips() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const role = params.get('role') || 'offered';

  const [trips,  setTrips]  = useState(null);
  const [rides,  setRides]  = useState(null);
  const [page, setPage] = useState(1);
  const [cancelling, setCancelling] = useState(null);
  const [cancelErr,  setCancelErr]  = useState('');
  const perPage = 5;

  /* Load trips (booked) */
  useEffect(() => {
    if (role === 'offered') { setTrips([]); return; }
    setTrips(null);
    api.get('/trips', { params: { role } })
      .then(({ data }) => setTrips(data.trips))
      .catch(() => setTrips([]));
  }, [role]);

  useEffect(() => {
    setPage(1);
  }, [role]);

  /* Load offered rides (driver's published rides) */
  useEffect(() => {
    api.get('/rides/mine')
      .then(({ data }) => setRides(data.rides))
      .catch(() => setRides([]));
  }, []);

  const cancelRide = async (rideId) => {
    setCancelling(rideId); setCancelErr('');
    try {
      await api.patch(`/rides/${rideId}/cancel`);
      setRides((prev) => prev.map((r) => r.ride_id === rideId ? { ...r, status: 'CANCELLED' } : r));
    } catch (e) {
      setCancelErr(e?.response?.data?.error || 'Failed to cancel');
    } finally {
      setCancelling(null);
    }
  };

  const rideList = Array.isArray(rides) ? rides : [];
  const tripList = Array.isArray(trips) ? trips : [];
  const totalPages = Math.max(1, Math.ceil((role === 'offered' ? rideList.length : tripList.length) / perPage));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * perPage;
  const visibleRides = rideList.slice(startIndex, startIndex + perPage);
  const visibleTrips = tripList.slice(startIndex, startIndex + perPage);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-800">My Trips</h1>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setParams(t.key === 'offered' ? {} : { role: t.key })}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              role === t.key
                ? 'bg-brand text-white shadow-sm'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            {t.Icon && <t.Icon className="h-3.5 w-3.5" strokeWidth={2} />}
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Offered Rides tab ── */}
      {role === 'offered' && (
        <div className="space-y-3">
          {rides === null ? <Spinner /> : rides.length === 0 ? (
            <Empty
              title="No rides offered yet"
              hint="Use 'Offer a Ride' to publish a ride for colleagues to book."
            />
          ) : (
            <>
              {cancelErr && (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{cancelErr}</p>
              )}
              <p className="text-sm text-slate-400">
                {rides.filter(r => r.status === 'OPEN').length} open · {rides.length} total
              </p>
              {rideList.length > perPage && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
                  <span>Showing {startIndex + 1}-{Math.min(startIndex + perPage, rideList.length)} of {rideList.length}</span>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" className="px-3 py-1 text-xs" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}>Prev</Button>
                    <span className="text-xs font-medium text-slate-600">Page {safePage} / {totalPages}</span>
                    <Button variant="outline" className="px-3 py-1 text-xs" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>Next</Button>
                  </div>
                </div>
              )}
              {visibleRides.map((r) => (
                <Card key={r.ride_id} className="p-4 transition hover:shadow-md">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge status={r.status} />
                        <span className="text-xs text-slate-400">
                          {new Date(r.departure_datetime).toLocaleString()}
                        </span>
                        {r.is_recurring && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                            <RefreshCw className="h-3 w-3" /> Recurring
                          </span>
                        )}
                      </div>
                      {/* Route: pickup → destination in one line */}
                      <div className="mt-2 flex min-w-0 items-center gap-1.5 overflow-hidden text-sm text-slate-600">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-brand" />
                        <span className="flex-1 min-w-0 truncate">{r.pickup_address}</span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-rose-500" />
                        <span className="flex-1 min-w-0 truncate">{r.destination_address}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
                        <span className="inline-flex items-center gap-1"><Car className="h-3 w-3" /> {r.vehicle_model} ({r.registration_number})</span>
                        <span className="inline-flex items-center gap-1"><Armchair className="h-3 w-3" /> {r.available_seats}/{r.total_seats} seats left</span>
                        {r.distance_km && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {r.distance_km} km</span>}
                        {r.duration_minutes && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> ~{r.duration_minutes} min</span>}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="text-lg font-bold text-brand-dark">{money(r.fare_per_seat)}</div>
                      <div className="text-xs text-slate-400">per seat</div>
                      {r.status === 'OPEN' && (
                        <Button
                          variant="danger"
                          className="text-xs py-1 px-3"
                          onClick={() => cancelRide(r.ride_id)}
                          disabled={cancelling === r.ride_id}
                        >
                          {cancelling === r.ride_id ? 'Cancelling…' : 'Cancel ride'}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Show bookings count if ride is FULL */}
                  {r.status === 'FULL' && (
                    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
                      Ride is full — all seats booked
                    </p>
                  )}
                </Card>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── Trips (booked) tabs ── */}
      {role !== 'offered' && (
        <div className="space-y-3">
          {trips === null ? <Spinner /> : trips.length === 0 ? (
            <Empty title="No trips yet" hint="Book a ride to see it here." />
          ) : (
            <>
              {tripList.length > perPage && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
                  <span>Showing {startIndex + 1}-{Math.min(startIndex + perPage, tripList.length)} of {tripList.length}</span>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" className="px-3 py-1 text-xs" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}>Prev</Button>
                    <span className="text-xs font-medium text-slate-600">Page {safePage} / {totalPages}</span>
                    <Button variant="outline" className="px-3 py-1 text-xs" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>Next</Button>
                  </div>
                </div>
              )}
              {visibleTrips.map((t) => {
                const iAmDriver = t.driver_employee_id === user.employeeId;
                return (
                  <Link key={t.trip_id} to={`/app/trips/${t.trip_id}`}>
                    <Card className="p-4 transition hover:ring-brand hover:shadow-md">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge status={t.status} />
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400">
                              {iAmDriver ? <><Car className="h-3 w-3" /> You drive</> : `Driver: ${t.driver_name}`}
                            </span>
                          </div>
                          {/* Route: pickup → destination in one line */}
                          <div className="mt-1 flex min-w-0 items-center gap-1.5 overflow-hidden text-sm text-slate-600">
                            <MapPin className="h-3.5 w-3.5 shrink-0 text-brand" />
                            <span className="flex-1 min-w-0 truncate">{t.pickup_address}</span>
                            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <MapPin className="h-3.5 w-3.5 shrink-0 text-rose-500" />
                            <span className="flex-1 min-w-0 truncate">{t.destination_address}</span>
                          </div>
                          <p className="mt-1 text-xs text-slate-400">
                            {new Date(t.departure_datetime).toLocaleString()} ·{' '}
                            {iAmDriver ? `Passenger: ${t.passenger_name}` : t.vehicle_model}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-brand-dark">{money(t.fare_amount)}</div>
                          <div className="text-xs text-slate-400">{t.distance_km} km</div>
                        </div>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
